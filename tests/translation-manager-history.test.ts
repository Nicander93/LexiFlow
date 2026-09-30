import { describe, expect, it, vi } from "vitest";
import type { TranslationHistory, TranslationRequest } from "../electron/shared/types";
import { TranslationManager } from "../electron/main/translation/manager";
import { TranslationSessionStore } from "../electron/main/translation/session-store";
import { TranslationEngine } from "../electron/main/application/translation/translation-engine";
import { DEFAULT_SETTINGS } from "../electron/shared/defaults";
import { IPC_CHANNELS } from "../electron/shared/types";

describe("TranslationManager history session", () => {
  it("isolates selection requests from the full translation session and history", async () => {
    const sessions = new TranslationSessionStore();
    sessions.create({ source: "main", sourceText: "Full document", resultText: "Existing translation", segments: [], status: "success", profileId: "general", targetLanguage: "zh-CN", requestId: "full-request" });
    const previousSession = sessions.getActive();
    const history = { add: vi.fn() };
    const sender = { isDestroyed: () => false, send: vi.fn() };
    const translate = vi.fn(async function* (_request: TranslationRequest) { yield { content: '{"id":"segment-1","target":"Selected translation"}\n', done: true }; });
    const engine = new TranslationEngine({
      getSettings: () => structuredClone(DEFAULT_SETTINGS),
      getProfile: () => ({ id: "general", targetLanguage: "zh-CN", allowRemote: false } as never),
      matchGlossary: () => ({}), createGateway: () => ({ translate, chat: async function* () {} })
    });
    const manager = new TranslationManager({ get: () => DEFAULT_SETTINGS } as never, history as never, {} as never, {} as never, sessions, { engine, createGateway: () => ({}) as never });
    const requestId = manager.translateSelection(sender as never, { text: "选中的中文", profileId: "general" });
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith(IPC_CHANNELS.selectionTranslationEvent, expect.objectContaining({ requestId, status: "success", result: expect.objectContaining({ targetLanguage: "en" }) })));
    expect(translate.mock.calls[0]?.[0]).toMatchObject({ text: "选中的中文", targetLanguage: "auto" });
    expect(sessions.getActive()).toEqual(previousSession);
    expect(history.add).not.toHaveBeenCalled();
    expect(sender.send.mock.calls.every(([channel]) => channel === IPC_CHANNELS.selectionTranslationEvent)).toBe(true);
  });

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
