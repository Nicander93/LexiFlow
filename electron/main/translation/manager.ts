/**
 * Interactive translation facade: owns request lanes, session/reducer updates,
 * history-session coordination, and delegates auxiliary model use cases.
 */
import { randomUUID } from "node:crypto";
import type { WebContents } from "electron";
import { mapProviderError } from "../core/errors";
import { modelTaskScheduler } from "../core/model-task-scheduler";
import { persistHistorySafely } from "../core/non-fatal";
import type { HistoryStore } from "../storage/history";
import type { SettingsStore } from "../storage/settings";
import type { GlossaryStore } from "../storage/glossary";
import type { ProfileStore } from "../storage/profiles";
import { createTranslationResult } from "./result";
import { TranslationSessionStore } from "./session-store";
import { RequestCoordinator, type RequestLane } from "./request-coordinator";
import { TranslationEngine, type TranslationEngineProgress } from "../application/translation/translation-engine";
import type { InteractiveModelGatewayFactory } from "../domain/translation/ports";
import { InteractiveTranslationUseCases } from "./interactive-use-cases";
import {
  IPC_CHANNELS,
  type DictionaryContextEvent,
  type DictionaryContextRequest,
  type SegmentRevisionEvent,
  type SegmentRevisionRequest,
  type SegmentAlternativeEvent,
  type SegmentAlternativeRequest,
  type TranslationEvent,
  type TranslationRequest,
  type TranslationSurface,
  type TranslationState
} from "../../shared/types";
import { reduceTranslationState } from "../../shared/translation-state";

export class TranslationManager {
  private readonly coordinator = new RequestCoordinator();
  private readonly engine: TranslationEngine;
  private readonly interactive: InteractiveTranslationUseCases;

  constructor(
    private readonly settingsStore: SettingsStore,
    private readonly historyStore: HistoryStore,
    glossaryStore: GlossaryStore,
    profileStore: ProfileStore,
    private readonly sessionStore: TranslationSessionStore,
    options: { engine: TranslationEngine; createGateway: InteractiveModelGatewayFactory }
  ) {
    this.engine = options.engine;
    this.interactive = new InteractiveTranslationUseCases(settingsStore, profileStore, options.createGateway, this.coordinator, {
      revision: (sender, event) => this.emitRevision(sender, event),
      alternatives: (sender, event) => this.emitAlternatives(sender, event),
      dictionary: (sender, event) => this.emitDictionaryContext(sender, event)
    });
    void glossaryStore;
  }

  private emit(sender: WebContents, event: TranslationEvent): void {
    const active = this.sessionStore.getActive();
    if (active?.requestId === event.requestId) {
      const state: TranslationState = {
        requestId: event.requestId,
        status: active.status,
        content: active.resultText,
        result: {
          requestId: event.requestId,
          sourceText: active.sourceText,
          targetText: active.resultText,
          sourceLanguage: "",
          targetLanguage: active.targetLanguage,
          segments: active.segments,
          modelInfo: { provider: "ollama", model: "", durationMs: 0 },
          createdAt: active.createdAt
        },
        historyId: active.historyId
      };
      const reduced = reduceTranslationState(state, event);
      this.sessionStore.patch(event.requestId, { status: reduced.status, resultText: reduced.content, segments: reduced.result?.segments ?? active.segments, historyId: reduced.historyId ?? active.historyId });
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

  private laneForSurface(surface: TranslationSurface | undefined): RequestLane {
    return surface === "popup" ? "popup-translation" : "main-translation";
  }

  start(sender: WebContents, request: TranslationRequest): string {
    const id = randomUUID();
    const signal = this.coordinator.begin(this.laneForSurface(request.surface), id);
    this.sessionStore.create({ source: request.surface ?? "main", sourceText: request.text, resultText: "", segments: [], status: "loading", profileId: request.profileId ?? "general", targetLanguage: request.targetLanguage, requestId: id });
    void this.run(sender, id, request, signal);
    return id;
  }

  revise(sender: WebContents, request: SegmentRevisionRequest): string {
    const id = randomUUID();
    const signal = this.coordinator.begin("segment-revision", id);
    void this.interactive.runRevision(sender, id, request, signal);
    return id;
  }

  alternatives(sender: WebContents, request: SegmentAlternativeRequest): string {
    const id = randomUUID();
    const signal = this.coordinator.begin("segment-alternatives", id);
    void this.interactive.runAlternatives(sender, id, request, signal);
    return id;
  }

  explainDictionary(sender: WebContents, request: DictionaryContextRequest): string {
    const id = randomUUID();
    const signal = this.coordinator.begin("dictionary-context", id);
    void this.interactive.runDictionaryContext(sender, id, request, signal);
    return id;
  }

  private async run(sender: WebContents, requestId: string, request: TranslationRequest, signal: AbortSignal): Promise<void> {
    this.emit(sender, { requestId, status: "loading" });
    const historyId = randomUUID();
    try {
      const output = await modelTaskScheduler.runInteractive(({ signal: slotSignal }) => this.engine.translate({
        text: request.text,
        profileId: request.profileId,
        taskType: request.mode === "naming" ? "naming" : "translation",
        mode: request.mode,
        profilePrompt: request.profilePrompt,
        targetLanguage: request.targetLanguage,
        signal: slotSignal,
        onProgress: (event: TranslationEngineProgress) => {
          if (!this.coordinator.isActive(requestId)) return;
          if (event.type === "text") this.emit(sender, { requestId, status: "streaming", content: event.content });
          else this.emit(sender, { requestId, status: "streaming", segment: event.segment });
        }
      }), signal);

      if (!this.coordinator.isActive(requestId)) return;
      const result = output.policy.taskType === "naming"
        ? undefined
        : createTranslationResult({ requestId, sourceText: output.sourceText, originalSourceText: output.originalSourceText, sourceLanguage: output.sourceLanguage, targetLanguage: output.targetLanguage, sourceSegments: output.sourceSegments, responseText: output.targetText, segments: output.segments, cleanupActions: output.cleanupActions, modelInfo: output.modelInfo, promptVersion: output.promptVersion });
      const displayText = result?.targetText ?? output.targetText;
      if (result) result.glossaryValidation = Object.entries(output.glossary).map(([sourceTerm, targetTerm]) => ({ sourceTerm, targetTerm, applied: displayText.includes(targetTerm) }));
      this.emit(sender, { requestId, status: "success", content: displayText, result, historyId });
      const settings = this.settingsStore.get();
      const historyWarning = await persistHistorySafely(() => this.historyStore.add({
        id: historyId,
        sourceText: output.sourceText,
        originalSourceText: output.originalSourceText,
        resultText: displayText,
        originalResultText: displayText,
        mode: output.policy.historyMode,
        profileId: output.policy.profileId,
        sourceLanguage: output.sourceLanguage,
        targetLanguage: output.targetLanguage,
        provider: output.modelInfo.provider,
        model: output.modelInfo.model,
        promptVersion: output.promptVersion,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isFavorite: false,
        revisions: [],
        segments: result?.segments
      }, settings.history));
      if (historyWarning && this.coordinator.isActive(requestId)) this.emit(sender, { requestId, status: "success", content: displayText, result, historyId, warning: historyWarning });
    } catch (error) {
      if (signal.aborted) this.emit(sender, { requestId, status: "cancelled", error: "请求已取消。" });
      else {
        console.error("Translation request failed", error instanceof Error ? error.message : error);
        this.emit(sender, { requestId, status: "error", error: mapProviderError(error) });
      }
    } finally {
      this.coordinator.end(requestId);
    }
  }

  cancel(requestId?: string): void { this.coordinator.cancelRequest(requestId); }
  cancelLane(lane: RequestLane): void { this.coordinator.cancel(lane); }

  openHistorySession(sender: WebContents, historyId: string): boolean {
    const history = this.historyStore.get(historyId);
    if (!history) return false;
    const targetLanguage = history.targetLanguage === "en" || history.targetLanguage === "zh-CN" ? history.targetLanguage : "auto";
    const session = this.sessionStore.create({ source: "history", sourceText: history.sourceText, resultText: history.resultText, segments: history.segments ?? [], status: "success", profileId: history.profileId ?? "general", targetLanguage, historyId: history.id });
    const result = { requestId: session.id, sourceText: history.sourceText, originalSourceText: history.originalSourceText, targetText: history.resultText, sourceLanguage: history.sourceLanguage ?? "", targetLanguage: history.targetLanguage, segments: history.segments ?? [], modelInfo: { provider: history.provider, model: history.model, durationMs: 0 }, promptVersion: history.promptVersion, createdAt: session.createdAt };
    if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.translationEvent, { requestId: session.id, status: "success", content: history.resultText, result, historyId: history.id });
    return true;
  }
}
