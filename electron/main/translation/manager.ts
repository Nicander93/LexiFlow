/**
 * 交互翻译编排：清理 → 切段 → resolveModelAccess → 流式 Provider → 结构化校验/一次修复 → 结果与历史。
 * 同一时刻只保留一个 activeRequest；新请求会取消旧请求，并通过 ModelRequestGate 抢占文档分块。
 * 局部重译 / 候选 / 词典上下文共用本 Manager，事件用各自 requestId 过滤。
 */
import { randomUUID } from "node:crypto";
import type { WebContents } from "electron";
import { detectLanguage, resolveTargetLanguage } from "../core/language";
import { mapProviderError } from "../core/errors";
import { cleanInputText } from "../core/text-cleanup";
import { modelRequestGate } from "../core/model-request-gate";
import { resolveModelAccess } from "../core/profile-policy";
import {
  buildStructuredRepairPrompt,
  recordStructuredParseFailure,
  validateAlternativesResponse,
  validateNamingResponse,
  validateSegmentResponse,
  type StructuredKind
} from "../core/structured";
import { validateInput } from "../core/validation";
import { createProvider } from "../provider";
import type { HistoryStore } from "../storage/history";
import type { SettingsStore } from "../storage/settings";
import type { GlossaryStore } from "../storage/glossary";
import type { ProfileStore } from "../storage/profiles";
import { createTranslationResult } from "./result";
import { splitIntoSegments } from "./segments";
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
  type TranslationRequest
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
    private readonly profileStore: ProfileStore
  ) {}

  private emit(sender: WebContents, event: TranslationEvent): void {
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
    modelRequestGate.beginInteractive();
    return controller;
  }

  private endInteractive(requestId: string): void {
    if (this.activeRequest?.id === requestId) {
      this.activeRequest = null;
      modelRequestGate.endInteractive();
    }
  }

  start(sender: WebContents, request: TranslationRequest): string {
    const id = randomUUID();
    const controller = this.beginInteractive(id);
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

  private async runDictionaryContext(sender: WebContents, requestId: string, request: DictionaryContextRequest, signal: AbortSignal): Promise<void> {
    if (!request.term.trim() || !request.source.trim() || !request.target.trim()) {
      this.emitDictionaryContext(sender, { requestId, status: "error", error: "词典上下文不完整。" });
      this.endInteractive(requestId);
      return;
    }
    const access = resolveModelAccess(this.settingsStore.get(), {
      profile: this.profileStore.get(request.profileId),
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
      const explanation = (await collectStream(createProvider(access.settings).explainDictionary(request, signal))).trim();
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
    const access = resolveModelAccess(this.settingsStore.get(), {
      profile: this.profileStore.get(request.profileId),
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
      let content = await collectStream(createProvider(access.settings).alternatives(request, signal));
      let parsed = validateAlternativesResponse(content, () => randomUUID());
      if (!parsed.ok) {
        recordStructuredParseFailure("alternatives", parsed.reason);
        content = await this.repairOnce("alternatives", content, access.settings, signal);
        parsed = validateAlternativesResponse(content, () => randomUUID());
        if (!parsed.ok) {
          recordStructuredParseFailure("alternatives", parsed.reason);
          throw new Error("候选译法格式无效。");
        }
      }
      this.alternativesCache.set(cacheKey, parsed.alternatives);
      if (this.alternativesCache.size > 50) this.alternativesCache.delete(this.alternativesCache.keys().next().value!);
      this.emitAlternatives(sender, { requestId, status: "success", alternatives: parsed.alternatives });
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
    const settings = this.settingsStore.get();
    const source = validateInput(request.segment.source, settings.translation.maxInputLength);
    if (!source.ok || !request.instruction.trim()) {
      this.emitRevision(sender, { requestId, status: "error", error: source.ok ? "重译要求不能为空。" : source.message });
      this.endInteractive(requestId);
      return;
    }
    const access = resolveModelAccess(settings, {
      profile: this.profileStore.get(request.profileId),
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
      const newTarget = (await collectStream(createProvider(access.settings).revise(request, signal))).trim();
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
    const originalText = validation.text;
    let inputText = originalText;
    if (settings.translation.autoCleanText) {
      try {
        const cleaned = cleanInputText(originalText, settings.translation);
        if (cleaned) inputText = cleaned;
      } catch {
        inputText = originalText;
      }
    }
    const profile = this.profileStore.get(request.profileId);
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
    const requestedTargetLanguage = profile && profile.targetLanguage !== "auto" ? profile.targetLanguage : request.targetLanguage;
    const targetLanguage = resolveTargetLanguage(inputText, requestedTargetLanguage);
    request = {
      ...request,
      text: inputText,
      targetLanguage: requestedTargetLanguage,
      profilePrompt: profile?.systemPrompt,
      temperature: profile?.temperature,
      glossary: profile?.enableGlossary === false ? undefined : this.glossaryStore.matches(inputText, sourceLanguage, targetLanguage)
    };
    this.emit(sender, { requestId, status: "loading" });
    let resultText = "";
    const startedAt = Date.now();
    const sourceSegments = request.mode === "naming" ? [] : splitIntoSegments(request.text);
    try {
      const provider = createProvider(access.settings);
      for await (const chunk of provider.translate(request, signal, sourceSegments)) {
        if (this.activeRequest?.id !== requestId) return;
        if (chunk.content) {
          resultText += chunk.content;
          if (request.mode === "naming") {
            this.emit(sender, { requestId, status: "streaming", content: chunk.content });
          }
        }
      }
      if (!resultText.trim()) throw new Error("模型返回空内容。");
      resultText = await this.resolveStructuredText(request.mode, resultText, sourceSegments, access.settings, signal);
      if (this.activeRequest?.id !== requestId) return;
      const result = request.mode === "naming"
        ? undefined
        : createTranslationResult({
            requestId,
            sourceText: request.text,
            sourceLanguage,
            targetLanguage,
            sourceSegments,
            responseText: resultText,
            modelInfo: { provider: access.settings.provider.type, model: access.settings.provider.model, durationMs: Date.now() - startedAt },
            promptVersion: PROMPT_VERSION
          });
      const displayText = result?.targetText ?? resultText;
      if (result) result.glossaryValidation = Object.entries(request.glossary ?? {}).map(([sourceTerm, targetTerm]) => ({ sourceTerm, targetTerm, applied: displayText.includes(targetTerm) }));
      this.emit(sender, { requestId, status: "success", content: displayText, result });
      await this.historyStore.add(
        {
          id: randomUUID(),
          sourceText: request.text,
          resultText: displayText,
          mode: request.mode,
          sourceLanguage,
          targetLanguage,
          provider: access.settings.provider.type,
          model: access.settings.provider.model,
          createdAt: new Date().toISOString(),
          isFavorite: false
        },
        settings.history
      );
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
    modelRequestGate.endInteractive();
  }
}
