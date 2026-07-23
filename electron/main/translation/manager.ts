import { randomUUID } from "node:crypto";
import type { WebContents } from "electron";
import { detectLanguage, resolveTargetLanguage } from "../core/language";
import { mapProviderError } from "../core/errors";
import { parseNamingResult } from "../core/naming";
import { validateInput } from "../core/validation";
import { createProvider } from "../provider";
import type { HistoryStore } from "../storage/history";
import type { SettingsStore } from "../storage/settings";
import {
  IPC_CHANNELS,
  type TranslationEvent,
  type TranslationRequest
} from "../../shared/types";

interface ActiveRequest {
  id: string;
  controller: AbortController;
}

export class TranslationManager {
  private activeRequest: ActiveRequest | null = null;

  constructor(
    private readonly settingsStore: SettingsStore,
    private readonly historyStore: HistoryStore
  ) {}

  private emit(sender: WebContents, event: TranslationEvent): void {
    if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.translationEvent, event);
  }

  start(sender: WebContents, request: TranslationRequest): string {
    this.cancel();
    const id = randomUUID();
    const controller = new AbortController();
    this.activeRequest = { id, controller };
    void this.run(sender, id, request, controller.signal);
    return id;
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
      if (this.activeRequest?.id === requestId) this.activeRequest = null;
      return;
    }
    request = { ...request, text: validation.text };
    this.emit(sender, { requestId, status: "loading" });
    let resultText = "";
    try {
      const provider = createProvider(settings);
      for await (const chunk of provider.translate(request, signal)) {
        if (this.activeRequest?.id !== requestId) return;
        if (chunk.content) {
          resultText += chunk.content;
          this.emit(sender, { requestId, status: "streaming", content: chunk.content });
        }
      }
      if (!resultText.trim()) throw new Error("模型返回空内容。 ");
      if (request.mode === "naming") {
        resultText = JSON.stringify(parseNamingResult(resultText));
      }
      if (this.activeRequest?.id !== requestId) return;
      this.emit(sender, { requestId, status: "success", content: resultText });
      await this.historyStore.add(
        {
          id: randomUUID(),
          sourceText: request.text,
          resultText,
          mode: request.mode,
          sourceLanguage: detectLanguage(request.text),
          targetLanguage: resolveTargetLanguage(request.text, request.targetLanguage),
          provider: settings.provider.type,
          model: settings.provider.model,
          createdAt: new Date().toISOString()
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
      if (this.activeRequest?.id === requestId) this.activeRequest = null;
    }
  }

  cancel(requestId?: string): void {
    if (!this.activeRequest) return;
    if (requestId && this.activeRequest.id !== requestId) return;
    this.activeRequest.controller.abort();
    this.activeRequest = null;
  }
}
