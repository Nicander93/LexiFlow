import type { CleanupAction, SourceSegment, TargetLanguage, TranslationMode, TranslationModelInfo, TranslationSegment, TranslationRequest } from "../../../shared/types";
import { PROMPT_VERSION } from "../../../shared/defaults";
import { prepareTranslationInput } from "../../core/text-cleanup";
import { validateInput } from "../../core/validation";
import { resolveTranslationPolicy, type ResolvedTranslationPolicy } from "../../core/translation-policy";
import { resolveModelAccess } from "../../core/model-access-gate";
import { UserFacingError } from "../../core/errors";
import { detectLanguage, resolveTargetLanguage } from "../../core/language";
import { NdjsonSegmentParser, assembleSegmentsFromTargets, buildMissingSegmentsPrompt } from "../../core/ndjson-segments";
import {
  buildStructuredRepairPrompt,
  recordStructuredParseFailure,
  validateNamingResponse,
  validateSegmentResponse
} from "../../core/structured";
import { splitIntoSegments } from "../../translation/segments";
import type { ModelGateway, TranslationEnginePorts } from "../../domain/translation/ports";

export type TranslationEngineProgress =
  | { type: "text"; content: string }
  | { type: "segment"; segment: TranslationSegment };

export interface TranslationEngineInput {
  text: string;
  profileId?: string;
  taskType: "translation" | "naming" | "document-chunk";
  mode?: TranslationMode;
  profilePrompt?: string;
  targetLanguage: TargetLanguage;
  signal: AbortSignal;
  segmentId?: string;
  onProgress?: (event: TranslationEngineProgress) => void;
}

export interface TranslationEngineOutput {
  sourceText: string;
  originalSourceText: string;
  targetText: string;
  segments: TranslationSegment[];
  sourceSegments: SourceSegment[];
  sourceLanguage: string;
  targetLanguage: TargetLanguage;
  glossary: Record<string, string>;
  cleanupActions: CleanupAction[];
  modelInfo: TranslationModelInfo;
  policy: ResolvedTranslationPolicy;
  promptVersion: string;
}

async function collect(
  stream: AsyncIterable<{ content: string }>,
  onChunk?: (content: string) => void
): Promise<string> {
  let content = "";
  for await (const chunk of stream) {
    if (!chunk.content) continue;
    content += chunk.content;
    onChunk?.(chunk.content);
  }
  return content;
}

/** Shared model-facing pipeline for interactive text and document chunks. */
export class TranslationEngine {
  constructor(private readonly ports: TranslationEnginePorts) {}

  private async repairStructured(
    kind: "naming" | "segments",
    raw: string,
    gateway: ModelGateway,
    signal: AbortSignal
  ): Promise<string> {
    const prompt = buildStructuredRepairPrompt(kind, raw);
    return collect(gateway.chat(
      [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }],
      signal
    ));
  }

  async translate(input: TranslationEngineInput): Promise<TranslationEngineOutput> {
    const settings = this.ports.getSettings();
    const validation = validateInput(input.text, settings.translation.maxInputLength);
    if (!validation.ok) throw new UserFacingError(validation.message);

    const prepared = settings.translation.autoCleanText
      ? prepareTranslationInput(validation.text, settings.translation)
      : { originalText: validation.text, normalizedText: validation.text, cleanupActions: [] as CleanupAction[] };
    const sourceText = prepared.normalizedText || prepared.originalText;
    const profile = this.ports.getProfile(input.profileId);
    const requestMode = input.taskType === "naming" ? "naming" : input.mode ?? "normal";
    const policy = resolveTranslationPolicy(settings, profile, {
      mode: requestMode,
      targetLanguage: input.targetLanguage,
      profileId: input.profileId,
      profilePrompt: input.profilePrompt
    });
    const access = resolveModelAccess(settings, {
      profile,
      task: input.taskType === "document-chunk" ? "document" : "translation",
      textLength: sourceText.length
    });
    if (!access.ok) throw new UserFacingError(access.error);

    const sourceLanguage = detectLanguage(sourceText);
    const targetLanguage = resolveTargetLanguage(sourceText, policy.targetLanguage);
    const sourceSegments = input.taskType === "naming"
      ? []
      : input.segmentId
        ? [{ id: input.segmentId, source: sourceText, sourceStart: 0, sourceEnd: sourceText.length }]
        : splitIntoSegments(sourceText);
    const request: TranslationRequest = {
      text: sourceText,
      mode: policy.historyMode,
      targetLanguage: policy.targetLanguage,
      profileId: policy.profileId,
      profilePrompt: policy.systemPrompt,
      temperature: policy.temperature,
      glossary: policy.enableGlossary ? this.ports.matchGlossary(sourceText, sourceLanguage, targetLanguage) : undefined
    };
    const gateway = this.ports.createGateway(access.settings);
    const startedAt = Date.now();

    let raw = "";
    let parser: NdjsonSegmentParser | undefined;
    if (input.taskType === "naming") {
      raw = await collect(gateway.translate(request, input.signal, sourceSegments), (content) => input.onProgress?.({ type: "text", content }));
    } else {
      parser = new NdjsonSegmentParser();
      const expectedIds = new Set(sourceSegments.map((segment) => segment.id));
      for await (const chunk of gateway.translate(request, input.signal, sourceSegments)) {
        if (!chunk.content) continue;
        raw += chunk.content;
        for (const partial of parser.push(chunk.content, expectedIds)) {
          const source = sourceSegments.find((segment) => segment.id === partial.id);
          if (source) input.onProgress?.({ type: "segment", segment: { ...source, target: partial.target } });
        }
      }
      for (const partial of parser.finish(expectedIds)) {
        const source = sourceSegments.find((segment) => segment.id === partial.id);
        if (source) input.onProgress?.({ type: "segment", segment: { ...source, target: partial.target } });
      }
    }
    if (!raw.trim()) throw new UserFacingError("模型返回空内容。");

    let targetText = raw.trim();
    let segments: TranslationSegment[] = [];
    if (input.taskType !== "naming") {
      const completedParser = parser!;
      let targets = completedParser.getCompleted();
      const missing = completedParser.missing(sourceSegments);
      if (missing.length && missing.length < sourceSegments.length) {
        const languageLabel = targetLanguage === "en" ? "英文" : "简体中文";
        const repair = buildMissingSegmentsPrompt(missing, languageLabel);
        const repairedRaw = await collect(gateway.chat(
          [{ role: "system", content: repair.system }, { role: "user", content: repair.user }],
          input.signal
        ));
        const repairParser = new NdjsonSegmentParser();
        for (const partial of [...repairParser.push(repairedRaw, new Set(missing.map((item) => item.id))), ...repairParser.finish(new Set(missing.map((item) => item.id)))]) {
          const source = sourceSegments.find((segment) => segment.id === partial.id);
          if (source) input.onProgress?.({ type: "segment", segment: { ...source, target: partial.target } });
        }
        targets = new Map([...targets, ...repairParser.getCompleted()]);
      }

      if (targets.size === 0 && raw.trim()) {
        let fallback = raw;
        let parsed = validateSegmentResponse(fallback, sourceSegments);
        if (!parsed.ok) {
          recordStructuredParseFailure("segments", parsed.reason);
          fallback = await this.repairStructured("segments", raw, gateway, input.signal);
          parsed = validateSegmentResponse(fallback, sourceSegments);
        }
        if (parsed.ok) {
          segments = parsed.segments;
          targetText = parsed.targetText;
          for (const segment of segments) input.onProgress?.({ type: "segment", segment });
        } else {
          targetText = fallback.trim() || raw.trim();
        }
      } else {
        if (!targets.size) throw new UserFacingError("模型返回空内容。");
        segments = assembleSegmentsFromTargets(sourceSegments, targets);
        targetText = segments.map((segment) => segment.target).join("\n");
      }
    } else {
      let parsed = validateNamingResponse(targetText);
      if (!parsed.ok) {
        recordStructuredParseFailure("naming", parsed.reason);
        const repaired = await this.repairStructured("naming", targetText, gateway, input.signal);
        parsed = validateNamingResponse(repaired);
        if (parsed.ok) targetText = JSON.stringify(parsed.result);
        else recordStructuredParseFailure("naming", parsed.reason);
      }
    }

    return {
      sourceText,
      originalSourceText: prepared.originalText,
      targetText,
      segments,
      sourceSegments,
      sourceLanguage,
      targetLanguage,
      glossary: request.glossary ?? {},
      cleanupActions: prepared.cleanupActions,
      modelInfo: {
        provider: access.settings.provider.type,
        model: access.settings.provider.model,
        durationMs: Date.now() - startedAt
      },
      policy,
      promptVersion: PROMPT_VERSION
    };
  }
}
