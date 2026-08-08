import { describe, expect, it, vi } from "vitest";
import type { TranslationHistory } from "../electron/shared/types";
import { TranslationManager } from "../electron/main/translation/manager";
import { TranslationSessionStore } from "../electron/main/translation/session-store";
import type { TranslationEngine } from "../electron/main/application/translation/translation-engine";

describe("TranslationManager history session", () => {
  it("uses historyId to restore a session and emits a success event", () => {
    const history: TranslationHistory = {
      id: "history-1",
      sourceText: "Hello",
      resultText: "Hello translated",
      mode: "normal",
      profileId: "general",
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
      provider: "ollama",
      model: "qwen",
      createdAt: "2026-08-08T00:00:00.000Z",
      isFavorite: false,
      segments: [{ id: "segment-1", source: "Hello", target: "Hello translated", sourceStart: 0, sourceEnd: 5 }]
    };
    const historyStore = { get: (id: string) => id === history.id ? structuredClone(history) : undefined };
    const sender = { isDestroyed: () => false, send: vi.fn() };
    const manager = new TranslationManager(
      { get: () => ({}) } as never,
      historyStore as never,
      {} as never,
      {} as never,
      new TranslationSessionStore(),
      { engine: {} as TranslationEngine, createGateway: () => ({}) as never }
    );

    expect(manager.openHistorySession(sender as never, history.id)).toBe(true);
    expect(sender.send).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      status: "success",
      historyId: history.id,
      content: history.resultText,
      result: expect.objectContaining({ sourceText: history.sourceText, targetText: history.resultText })
    }));
    expect(manager.openHistorySession(sender as never, "missing")).toBe(false);
  });
});
