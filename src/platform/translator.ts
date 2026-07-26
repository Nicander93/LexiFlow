import type { TranslatorApi } from "../../electron/shared/api";
import { DEFAULT_SETTINGS } from "../../electron/shared/defaults";
import type { DictionaryContextEvent, DictionaryEntry, DocumentTaskRecord, ProviderModel, SegmentAlternativeEvent, SegmentRevisionEvent, TranslationEvent, TranslationHistory } from "../../electron/shared/types";

export function getTranslatorApi(): TranslatorApi {
  if (!window.translator) {
    throw new Error("LexiFlow preload API is unavailable.");
  }
  return window.translator;
}

export function hasTranslatorApi(): boolean {
  return Boolean(window.translator);
}

export function installBrowserPreviewApi(): void {
  if (window.translator || navigator.userAgent.includes("Electron")) return;

  let settings = structuredClone(DEFAULT_SETTINGS);
  const listeners = new Set<(event: TranslationEvent) => void>();
  const revisionListeners = new Set<(event: SegmentRevisionEvent) => void>();
  const alternativesListeners = new Set<(event: SegmentAlternativeEvent) => void>();
  const dictionaryContextListeners = new Set<(event: DictionaryContextEvent) => void>();
  const history: TranslationHistory[] = [
    {
      id: "preview-history",
      sourceText: "Keep the implementation small and observable.",
      resultText: "让实现保持精简，并且便于观察运行状态。",
      mode: "technical",
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
      provider: "ollama",
      model: "qwen3.5:9b",
      createdAt: new Date().toISOString()
      ,isFavorite: false
    }
  ];

  // Browser preview mode is deliberately separate from Electron. It supports
  // visual review without masking a missing preload inside the real app.
  window.translator = {
    runtime: {
      ping: async () => ({ apiVersion: 1, electron: "browser-preview", platform: "browser" })
    },
    settings: {
      get: async () => structuredClone(settings),
      update: async (next) => {
        settings = structuredClone(next);
        return {
          settings: structuredClone(settings),
          shortcutResult: { translation: true, naming: true, screenshot: true, errors: [] }
        };
      }
    },
    provider: {
      healthCheck: async () => ({ ok: true, message: "浏览器预览模式：界面连接正常。" }),
      getModels: async (): Promise<ProviderModel[]> => [{ id: "qwen3.5:9b", name: "qwen3.5:9b" }]
    },
    translation: {
      start: async (request) => {
        const requestId = crypto.randomUUID();
        queueMicrotask(() => listeners.forEach((listener) => listener({ requestId, status: "loading" })));
        setTimeout(() => {
          const content = request.mode === "naming"
            ? JSON.stringify({
                recommended: "isContentReady",
                candidates: [
                  { name: "isContentReady", meaning: "内容是否已准备完成" },
                  { name: "hasContentLoaded", meaning: "内容是否已经加载" }
                ]
              })
            : "这是一段用于界面预览的流式结果。真实翻译只会在 Electron 中调用所选模型。";
          listeners.forEach((listener) => listener({ requestId, status: "success", content }));
        }, 450);
        return requestId;
      },
      cancel: () => undefined,
      onEvent: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    },
    revision: {
      start: async (request) => {
        const requestId = crypto.randomUUID();
        queueMicrotask(() => revisionListeners.forEach((listener) => listener({ requestId, status: "loading" })));
        setTimeout(() => revisionListeners.forEach((listener) => listener({
          requestId,
          status: "success",
          revision: { id: crypto.randomUUID(), segmentId: request.segment.id, previousTarget: request.segment.target, newTarget: `${request.segment.target}（已按要求调整）`, instruction: request.instruction, createdAt: Date.now() }
        })), 250);
        return requestId;
      },
      cancel: () => undefined,
      onEvent: (listener) => { revisionListeners.add(listener); return () => revisionListeners.delete(listener); }
    },
    alternatives: {
      start: async (request) => {
        const requestId = crypto.randomUUID();
        queueMicrotask(() => alternativesListeners.forEach((listener) => listener({ requestId, status: "loading" })));
        setTimeout(() => alternativesListeners.forEach((listener) => listener({ requestId, status: "success", alternatives: [
          { id: crypto.randomUUID(), label: "推荐译法", target: request.segment.target, description: "兼顾准确性和自然度" },
          { id: crypto.randomUUID(), label: "直译", target: `${request.segment.target}（直译）`, description: "尽量保留原文结构" },
          { id: crypto.randomUUID(), label: "正式表达", target: `${request.segment.target}（正式）`, description: "适合报告和正式文档" }
        ] })), 300);
        return requestId;
      },
      cancel: () => undefined,
      onEvent: (listener) => { alternativesListeners.add(listener); return () => alternativesListeners.delete(listener); }
    },
    selection: {
      capture: async () => ({ text: "" })
    },
    history: {
      list: async () => structuredClone(history),
      search: async (query) => {
        const normalized = query.trim().toLowerCase();
        return structuredClone(!normalized ? history : history.filter((item) => item.sourceText.toLowerCase().includes(normalized) || item.resultText.toLowerCase().includes(normalized)));
      },
      toggleFavorite: async (id) => {
        const item = history.find((candidate) => candidate.id === id);
        if (!item) return undefined;
        item.isFavorite = !item.isFavorite;
        return structuredClone(item);
      },
      delete: async (id) => {
        const index = history.findIndex((item) => item.id === id);
        if (index >= 0) history.splice(index, 1);
      },
      clear: async () => {
        history.splice(0);
      }
    },
    dictionary: {
      lookup: async (term): Promise<DictionaryEntry | undefined> => term.trim().toLowerCase() === "translation"
        ? { query: "translation", phonetic: "/trænzˈleɪʃn/", partOfSpeech: "noun", definitions: ["翻译；译文"], source: "local" }
        : undefined,
      context: {
        start: async (request) => {
          const requestId = crypto.randomUUID();
          queueMicrotask(() => dictionaryContextListeners.forEach((listener) => listener({ requestId, status: "loading" })));
          setTimeout(() => dictionaryContextListeners.forEach((listener) => listener({ requestId, status: "success", explanation: `“${request.term}”在此句中应结合整句语义理解。` })), 200);
          return requestId;
        },
        cancel: () => undefined,
        onEvent: (listener) => { dictionaryContextListeners.add(listener); return () => dictionaryContextListeners.delete(listener); }
      }
    },
    glossary: {
      list: async () => [],
      upsert: async (entry) => structuredClone(entry),
      delete: async () => undefined,
      conflicts: async () => [],
      importCsv: async () => ({ imported: 0, skipped: [] }),
      exportCsv: async () => ({ saved: false, count: 0 })
    },
    profiles: {
      list: async () => [],
      upsert: async (profile) => structuredClone(profile),
      delete: async () => undefined
    },
    documents: {
      list: async (): Promise<DocumentTaskRecord[]> => [],
      delete: async () => undefined,
      import: async () => undefined,
      export: async () => false,
      start: async () => undefined,
      pause: async () => undefined,
      cancel: async () => undefined,
      onEvent: () => () => undefined
    },
    privacy: { clearLocalData: async () => { history.splice(0); } },
    diagnostics: { exportReport: async () => ({ saved: false }) },
    ocr: { listScreens: async () => [], captureScreen: async () => { throw new Error("浏览器预览不支持 Windows OCR。"); }, onCaptureRequested: () => () => undefined },
    clipboard: {
      writeText: async (text) => navigator.clipboard?.writeText(text)
    },
    window: {
      openMain: () => undefined,
      closePopup: () => undefined,
      pinPopup: () => undefined,
      onPopupPayload: () => () => undefined,
      onNavigate: () => () => undefined
    }
  };
}
