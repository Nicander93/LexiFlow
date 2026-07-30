/**
 * 交互翻译编排：清理 → 切段 → resolveModelAccess → 流式 Provider → 结构化校验/一次修复 → 结果与历史。
 * 同一时刻只保留一个 activeRequest；模型调用经 ModelTaskScheduler 排队，交互优先于文档分块。
 * 局部重译 / 候选 / 词典上下文共用本 Manager，事件用各自 requestId 过滤。
 */
import { randomUUID } from "node:crypto";
import type { WebContents } from "electron";
import { detectLanguage, resolveTargetLanguage } from "../core/language";
import { mapProviderError } from "../core/errors";
import { prepareTranslationInput } from "../core/text-cleanup";
import { resolveModelAccess } from "../core/model-access-gate";
import { modelTaskScheduler } from "../core/model-task-scheduler";
import { assembleSegmentsFromTargets, buildMissingSegmentsPrompt, NdjsonSegmentParser } from "../core/ndjson-segments";
import { persistHistorySafely } from "../core/non-fatal";
import {
  buildStructuredRepairPrompt,
  recordStructuredParseFailure,
  validateAlternativesResponse,
  validateNamingResponse,
  validateSegmentResponse,
  type StructuredKind
} from "../core/structured";
import { resolveTranslationPolicy } from "../core/translation-policy";
import { validateInput } from "../core/validation";
import { createProvider } from "../provider";
import type { HistoryStore } from "../storage/history";
import type { SettingsStore } from "../storage/settings";
import type { GlossaryStore } from "../storage/glossary";
import type { ProfileStore } from "../storage/profiles";
import { createTranslationResult } from "./result";
import { splitIntoSegments } from "./segments";
import { TranslationSessionStore } from "./session-store";
import { PROMPT_VERSION } from "../../shared/defaults";
import {
  IPC_CHANNELS,
  type DictionaryContextEvent,
  type DictionaryContextRequest,
  type SegmentRevisionEvent,
  type SegmentRevisionRequest,
  type SegmentAlternativeEvent,
  type SegmentAlternativeRequest,
  type SegmentAlternative,
  type SourceSegment,
  type TranslationEvent,
  type TranslationRequest,
  type TranslationSegment
} from "../../shared/types";

interface ActiveRequest {
  id: string;
  controller: AbortController;
}

async function collectStream(stream: AsyncIterable<{ content: string }>): Promise<string> {
  let content = "";
  for await (const chunk of stream) content += chunk.content;
  return content;
}

export class TranslationManager {
  private activeRequest: ActiveRequest | null = null;
  private readonly alternativesCache = new Map<string, SegmentAlternative[]>();

  constructor(
    private readonly settingsStore: SettingsStore,
    private readonly historyStore: HistoryStore,
    private readonly glossaryStore: GlossaryStore,
    private readonly profileStore: ProfileStore,
    private readonly sessionStore: TranslationSessionStore
  ) {}

  private emit(sender: WebContents, event: TranslationEvent): void {
    const active = this.sessionStore.getActive();
    if (active?.requestId === event.requestId) {
      let segments = active.segments;
      let resultText = event.result?.targetText ?? active.resultText;
      if (event.segment) {
        const index = segments.findIndex((item) => item.id === event.segment!.id);
        segments = index < 0 ? [...segments, event.segment] : segments.map((item, itemIndex) => itemIndex === index ? event.segment! : item);
        resultText = segments.map((item) => item.target).join("\n");
      } else if (event.content && event.status === "streaming") resultText += event.content;
      this.sessionStore.patch(event.requestId, { status: event.status, resultText, segments, historyId: event.historyId ?? active.historyId });
    }
    if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.translationEvent, event);
  }

  private emitRevision(sender: WebContents, event: SegmentRevisionEvent): void {
    if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.revisionEvent, event);
  }
  private emitAlternatives(sender: WebContents, event: SegmentAlternativeEvent): void {
    if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.alternativesEvent, event);
  }
  private emitDictionaryContext(sender: WebContents, event: DictionaryContextEvent): void {
    if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.dictionaryContextEvent, event);
  }

  private beginInteractive(id: string): AbortController {
    this.cancel();
    const controller = new AbortController();
    this.activeRequest = { id, controller };
    return controller;
  }

  private endInteractive(requestId: string): void {
    if (this.activeRequest?.id === requestId) {
      this.activeRequest = null;
    }
  }

  start(sender: WebContents, request: TranslationRequest): string {
    const id = randomUUID();
    const controller = this.beginInteractive(id);
    this.sessionStore.create({ source: "main", sourceText: request.text, resultText: "", segments: [], status: "loading", profileId: request.profileId ?? "general", targetLanguage: request.targetLanguage, requestId: id });
    void this.run(sender, id, request, controller.signal);
    return id;
  }

  revise(sender: WebContents, request: SegmentRevisionRequest): string {
    const id = randomUUID();
    const controller = this.beginInteractive(id);
    void this.runRevision(sender, id, request, controller.signal);
    return id;
  }
  alternatives(sender: WebContents, request: SegmentAlternativeRequest): string {
    const id = randomUUID();
    const controller = this.beginInteractive(id);
    void this.runAlternatives(sender, id, request, controller.signal);
    return id;
  }
  explainDictionary(sender: WebContents, request: DictionaryContextRequest): string {
    const id = randomUUID();
    const controller = this.beginInteractive(id);
    void this.runDictionaryContext(sender, id, request, controller.signal);
    return id;
  }

  private async repairOnce(
    kind: StructuredKind,
    raw: string,
    settings: ReturnType<SettingsStore["get"]>,
    signal: AbortSignal
  ): Promise<string> {
    const prompt = buildStructuredRepairPrompt(kind, raw);
    return collectStream(createProvider(settings).chat([{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }], signal));
  }

  private async runModelInteractive<T>(signal: AbortSignal, work: (slotSignal: AbortSignal) => Promise<T>): Promise<T> {
    return modelTaskScheduler.runInteractive(async ({ signal: slotSignal }) => work(slotSignal), signal);
  }

  private applyEnhancementPolicy<T extends { profileId?: string; profilePrompt?: string; targetLanguage: import("../../shared/types").TargetLanguage }>(
    request: T
  ): { request: T; profile: ReturnType<ProfileStore["get"]>; settings: ReturnType<SettingsStore["get"]> } {
    const settings = this.settingsStore.get();
    const profile = this.profileStore.get(request.profileId);
    const policy = resolveTranslationPolicy(settings, profile, {
      mode: "normal",
      targetLanguage: request.targetLanguage,
      profileId: request.profileId
    });
    return {
      settings,
      profile,
      request: {
        ...request,
        profileId: policy.profileId,
        profilePrompt: policy.systemPrompt,
        targetLanguage: policy.targetLanguage
      }
    };
  }

  private async runDictionaryContext(sender: WebContents, requestId: string, request: DictionaryContextRequest, signal: AbortSignal): Promise<void> {
    if (!request.term.trim() || !request.source.trim() || !request.target.trim()) {
      this.emitDictionaryContext(sender, { requestId, status: "error", error: "词典上下文不完整。" });
      this.endInteractive(requestId);
      return;
    }
    const resolved = this.applyEnhancementPolicy(request);
    request = resolved.request;
    const access = resolveModelAccess(resolved.settings, {
      profile: resolved.profile,
      task: "dictionary",
      textLength: request.source.length
    });
    if (!access.ok) {
      this.emitDictionaryContext(sender, { requestId, status: "error", error: access.error });
      this.endInteractive(requestId);
      return;
    }
    this.emitDictionaryContext(sender, { requestId, status: "loading" });
    try {
      const explanation = (await this.runModelInteractive(signal, (slotSignal) =>
        collectStream(createProvider(access.settings).explainDictionary(request, slotSignal))
      )).trim();
      if (!explanation) throw new Error("模型返回空内容。");
      if (this.activeRequest?.id !== requestId) return;
      this.emitDictionaryContext(sender, { requestId, status: "success", explanation });
    } catch (error) {
      this.emitDictionaryContext(sender, { requestId, status: signal.aborted ? "cancelled" : "error", error: signal.aborted ? "请求已取消。" : mapProviderError(error) });
    } finally {
      this.endInteractive(requestId);
    }
  }

  private async runAlternatives(sender: WebContents, requestId: string, request: SegmentAlternativeRequest, signal: AbortSignal): Promise<void> {
    const cacheKey = `${request.targetLanguage}\u0000${request.segment.source}\u0000${request.segment.target}`;
    const cached = this.alternativesCache.get(cacheKey);
    if (cached) {
      this.emitAlternatives(sender, { requestId, status: "success", alternatives: structuredClone(cached) });
      this.endInteractive(requestId);
      return;
    }
    const resolved = this.applyEnhancementPolicy(request);
    request = resolved.request;
    const access = resolveModelAccess(resolved.settings, {
      profile: resolved.profile,
      task: "alternatives",
      textLength: request.segment.source.length
    });
    if (!access.ok) {
      this.emitAlternatives(sender, { requestId, status: "error", error: access.error });
      this.endInteractive(requestId);
      return;
    }
    this.emitAlternatives(sender, { requestId, status: "loading" });
    try {
      const alternatives = await this.runModelInteractive(signal, async (slotSignal) => {
        let content = await collectStream(createProvider(access.settings).alternatives(request, slotSignal));
        let parsed = validateAlternativesResponse(content, () => randomUUID());
        if (!parsed.ok) {
          recordStructuredParseFailure("alternatives", parsed.reason);
          content = await this.repairOnce("alternatives", content, access.settings, slotSignal);
          parsed = validateAlternativesResponse(content, () => randomUUID());
          if (!parsed.ok) {
            recordStructuredParseFailure("alternatives", parsed.reason);
            throw new Error("候选译法格式无效。");
          }
        }
        return parsed.alternatives;
      });
      this.alternativesCache.set(cacheKey, alternatives);
      if (this.alternativesCache.size > 50) this.alternativesCache.delete(this.alternativesCache.keys().next().value!);
      this.emitAlternatives(sender, { requestId, status: "success", alternatives });
    } catch (error) {
      this.emitAlternatives(sender, { requestId, status: signal.aborted ? "cancelled" : "error", error: signal.aborted ? "请求已取消。" : mapProviderError(error) });
    } finally {
      this.endInteractive(requestId);
    }
  }

  private async runRevision(
    sender: WebContents,
    requestId: string,
    request: SegmentRevisionRequest,
    signal: AbortSignal
  ): Promise<void> {
    const source = validateInput(request.segment.source, this.settingsStore.get().translation.maxInputLength);
    if (!source.ok || !request.instruction.trim()) {
      this.emitRevision(sender, { requestId, status: "error", error: source.ok ? "重译要求不能为空。" : source.message });
      this.endInteractive(requestId);
      return;
    }
    const resolved = this.applyEnhancementPolicy(request);
    request = resolved.request;
    const access = resolveModelAccess(resolved.settings, {
      profile: resolved.profile,
      task: "revision",
      textLength: request.segment.source.length
    });
    if (!access.ok) {
      this.emitRevision(sender, { requestId, status: "error", error: access.error });
      this.endInteractive(requestId);
      return;
    }
    this.emitRevision(sender, { requestId, status: "loading" });
    try {
      const newTarget = (await this.runModelInteractive(signal, (slotSignal) =>
        collectStream(createProvider(access.settings).revise(request, slotSignal))
      )).trim();
      if (!newTarget) throw new Error("模型返回空内容。");
      if (this.activeRequest?.id !== requestId) return;
      this.emitRevision(sender, {
        requestId,
        status: "success",
        revision: {
          id: randomUUID(),
          segmentId: request.segment.id,
          previousTarget: request.segment.target,
          newTarget,
          instruction: request.instruction.trim(),
          createdAt: Date.now()
        }
      });
    } catch (error) {
      this.emitRevision(sender, {
        requestId,
        status: signal.aborted ? "cancelled" : "error",
        error: signal.aborted ? "请求已取消。" : mapProviderError(error)
      });
    } finally {
      this.endInteractive(requestId);
    }
  }

  private async resolveStructuredText(
    mode: TranslationRequest["mode"],
    responseText: string,
    sourceSegments: SourceSegment[],
    settings: ReturnType<SettingsStore["get"]>,
    signal: AbortSignal
  ): Promise<string> {
    if (mode === "naming") {
      let parsed = validateNamingResponse(responseText);
      if (parsed.ok) return JSON.stringify(parsed.result);
      recordStructuredParseFailure("naming", parsed.reason);
      const repaired = await this.repairOnce("naming", responseText, settings, signal);
      parsed = validateNamingResponse(repaired);
      if (parsed.ok) return JSON.stringify(parsed.result);
      recordStructuredParseFailure("naming", parsed.reason);
      const fallback = (repaired.trim() || responseText.trim() || "unnamed");
      return JSON.stringify({ recommended: fallback, candidates: [{ name: fallback, meaning: "格式修复失败后的安全回退" }] });
    }
    if (!sourceSegments.length) return responseText;
    let parsed = validateSegmentResponse(responseText, sourceSegments);
    if (parsed.ok) return responseText;
    recordStructuredParseFailure("segments", parsed.reason);
    const repaired = await this.repairOnce("segments", responseText, settings, signal);
    parsed = validateSegmentResponse(repaired, sourceSegments);
    if (parsed.ok) return repaired;
    recordStructuredParseFailure("segments", parsed.reason);
    return repaired.trim() || responseText;
  }

  private async run(
    sender: WebContents,
    requestId: string,
    request: TranslationRequest,
    signal: AbortSignal
  ): Promise<void> {
    const settings = this.settingsStore.get();
    const validation = validateInput(request.text, settings.translation.maxInputLength);
    if (!validation.ok) {
      this.emit(sender, { requestId, status: "error", error: validation.message });
      this.endInteractive(requestId);
      return;
    }
    const prepared = settings.translation.autoCleanText
      ? (() => {
          try {
            return prepareTranslationInput(validation.text, settings.translation);
          } catch {
            return { originalText: validation.text, normalizedText: validation.text, cleanupActions: [] };
          }
        })()
      : { originalText: validation.text, normalizedText: validation.text, cleanupActions: [] };
    const inputText = prepared.normalizedText || prepared.originalText;
    const profile = this.profileStore.get(request.profileId);
    const policy = resolveTranslationPolicy(settings, profile, request);
    const access = resolveModelAccess(settings, {
      profile,
      task: "translation",
      textLength: inputText.length
    });
    if (!access.ok) {
      this.emit(sender, { requestId, status: "error", error: access.error });
      this.endInteractive(requestId);
      return;
    }
    const sourceLanguage = detectLanguage(inputText);
    const targetLanguage = resolveTargetLanguage(inputText, policy.targetLanguage);
    request = {
      ...request,
      text: inputText,
      mode: policy.historyMode,
      targetLanguage: policy.targetLanguage,
      profileId: policy.profileId,
      profilePrompt: policy.systemPrompt,
      temperature: policy.temperature,
      glossary: policy.enableGlossary ? this.glossaryStore.matches(inputText, sourceLanguage, targetLanguage) : undefined
    };
    this.emit(sender, { requestId, status: "loading" });
    const startedAt = Date.now();
    const sourceSegments = policy.taskType === "naming" ? [] : splitIntoSegments(request.text);
    const historyId = randomUUID();
    try {
      const streamed = await this.runModelInteractive(signal, async (slotSignal) => {
        const provider = createProvider(access.settings);
        if (policy.taskType === "naming") {
          let collected = "";
          for await (const chunk of provider.translate(request, slotSignal, sourceSegments)) {
            if (this.activeRequest?.id !== requestId) return { text: collected, segments: [] as TranslationSegment[] };
            if (chunk.content) {
              collected += chunk.content;
              this.emit(sender, { requestId, status: "streaming", content: chunk.content });
            }
          }
          if (!collected.trim()) throw new Error("模型返回空内容。");
          const text = await this.resolveStructuredText(request.mode, collected, sourceSegments, access.settings, slotSignal);
          return { text, segments: [] as TranslationSegment[] };
        }

        const expectedIds = new Set(sourceSegments.map((segment) => segment.id));
        const parser = new NdjsonSegmentParser();
        let collected = "";
        for await (const chunk of provider.translate(request, slotSignal, sourceSegments)) {
          if (this.activeRequest?.id !== requestId) {
            return { text: collected, segments: assembleSegmentsFromTargets(sourceSegments, parser.getCompleted()) };
          }
          if (!chunk.content) continue;
          collected += chunk.content;
          for (const partial of parser.push(chunk.content, expectedIds)) {
            const source = sourceSegments.find((segment) => segment.id === partial.id);
            if (!source) continue;
            const segment = { ...source, target: partial.target };
            this.emit(sender, { requestId, status: "streaming", segment });
          }
        }
        for (const partial of parser.finish(expectedIds)) {
          const source = sourceSegments.find((segment) => segment.id === partial.id);
          if (!source) continue;
          this.emit(sender, { requestId, status: "streaming", segment: { ...source, target: partial.target } });
        }

        let targets = parser.getCompleted();
        const missing = parser.missing(sourceSegments);
        if (missing.length && missing.length < sourceSegments.length) {
          const languageLabel = targetLanguage === "en" ? "英文" : "简体中文";
          const repair = buildMissingSegmentsPrompt(missing, languageLabel);
          const repairedRaw = await collectStream(createProvider(access.settings).chat(
            [{ role: "system", content: repair.system }, { role: "user", content: repair.user }],
            slotSignal
          ));
          const repairParser = new NdjsonSegmentParser();
          for (const partial of [...repairParser.push(repairedRaw, new Set(missing.map((item) => item.id))), ...repairParser.finish(new Set(missing.map((item) => item.id)))]) {
            const source = sourceSegments.find((segment) => segment.id === partial.id);
            if (!source) continue;
            targets.set(partial.id, partial.target);
            this.emit(sender, { requestId, status: "streaming", segment: { ...source, target: partial.target } });
          }
          targets = new Map([...targets, ...repairParser.getCompleted()]);
        }

        if (targets.size === 0 && collected.trim()) {
          const fallback = await this.resolveStructuredText(request.mode, collected, sourceSegments, access.settings, slotSignal);
          const parsed = validateSegmentResponse(fallback, sourceSegments);
          if (parsed.ok) {
            for (const segment of parsed.segments) {
              this.emit(sender, { requestId, status: "streaming", segment });
            }
            return { text: parsed.targetText, segments: parsed.segments };
          }
          return { text: fallback, segments: [] as TranslationSegment[] };
        }

        if (!targets.size) throw new Error("模型返回空内容。");
        const segments = assembleSegmentsFromTargets(sourceSegments, targets);
        return { text: segments.map((segment) => segment.target).join("\n"), segments };
      });

      if (this.activeRequest?.id !== requestId) return;
      const result = policy.taskType === "naming"
        ? undefined
        : createTranslationResult({
            requestId,
            sourceText: request.text,
            originalSourceText: prepared.originalText,
            sourceLanguage,
            targetLanguage,
            sourceSegments,
            responseText: streamed.text,
            segments: streamed.segments,
            cleanupActions: prepared.cleanupActions,
            modelInfo: { provider: access.settings.provider.type, model: access.settings.provider.model, durationMs: Date.now() - startedAt },
            promptVersion: PROMPT_VERSION
          });
      const displayText = result?.targetText ?? streamed.text;
      if (result) result.glossaryValidation = Object.entries(request.glossary ?? {}).map(([sourceTerm, targetTerm]) => ({ sourceTerm, targetTerm, applied: displayText.includes(targetTerm) }));
      this.emit(sender, { requestId, status: "success", content: displayText, result, historyId });
      const historyWarning = await persistHistorySafely(() => this.historyStore.add(
        {
          id: historyId,
          sourceText: request.text,
          originalSourceText: prepared.originalText,
          resultText: displayText,
          originalResultText: displayText,
          mode: policy.historyMode,
          profileId: policy.profileId,
          sourceLanguage,
          targetLanguage,
          provider: access.settings.provider.type,
          model: access.settings.provider.model,
          promptVersion: PROMPT_VERSION,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isFavorite: false,
          revisions: [],
          segments: result?.segments
        },
        settings.history
      ));
      if (historyWarning && this.activeRequest?.id === requestId) {
        this.emit(sender, { requestId, status: "success", content: displayText, result, historyId, warning: historyWarning });
      }
    } catch (error) {
      if (signal.aborted) {
        this.emit(sender, { requestId, status: "cancelled", error: "请求已取消。" });
      } else {
        console.error("Translation request failed", error instanceof Error ? error.message : error);
        this.emit(sender, { requestId, status: "error", error: mapProviderError(error) });
      }
    } finally {
      this.endInteractive(requestId);
    }
  }

  cancel(requestId?: string): void {
    if (!this.activeRequest) return;
    if (requestId && this.activeRequest.id !== requestId) return;
    this.activeRequest.controller.abort();
    this.activeRequest = null;
  }
}
