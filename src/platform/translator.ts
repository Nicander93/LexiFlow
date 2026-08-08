import type { TranslatorApi } from "../../electron/shared/api";
import { DEFAULT_SETTINGS } from "../../electron/shared/defaults";
import type { DictionaryContextEvent, DocumentTaskRecord, ProviderModel, SegmentAlternativeEvent, SegmentRevisionEvent, TranslationEvent, TranslationHistory } from "../../electron/shared/types";
import { previewDictionaryLookup } from "./dictionary-preview";

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
  if (window.translator) return;
  // Packaged Electron expects preload; Cursor/IDE browsers also contain "Electron" in UA.
  if (navigator.userAgent.includes("Electron") && !import.meta.env.DEV) {
    const previewRequested = new URLSearchParams(window.location.search).has("preview");
    if (!previewRequested) return;
  }

  let settings = structuredClone(DEFAULT_SETTINGS);
  let settingsRevision = 0;
  const previewUuid = (): string => globalThis.crypto?.randomUUID?.() ?? `preview-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const listeners = new Set<(event: TranslationEvent) => void>();
  const revisionListeners = new Set<(event: SegmentRevisionEvent) => void>();
  const alternativesListeners = new Set<(event: SegmentAlternativeEvent) => void>();
  const dictionaryContextListeners = new Set<(event: DictionaryContextEvent) => void>();
  const popupPayloadListeners = new Set<(payload: { text?: string; mode: "normal" | "technical" | "naming"; profileId?: string; capturing?: boolean; error?: string }) => void>();
  const history: TranslationHistory[] = [
    {
      id: "preview-history-1",
      sourceText: "Keep the implementation small and observable.",
      resultText: "让实现保持精简，并且便于观察运行状态。",
      mode: "technical",
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
      provider: "ollama",
      model: "qwen3.5:9b",
      createdAt: new Date().toISOString(),
      isFavorite: true
    },
    {
      id: "preview-history-2",
      sourceText: "The renderer must not call Node.js APIs directly.",
      resultText: "渲染进程不得直接调用 Node.js API。",
      mode: "normal",
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
      provider: "ollama",
      model: "qwen3.5:9b",
      createdAt: new Date(Date.now() - 3600_000).toISOString(),
      isFavorite: false
    },
    {
      id: "preview-history-3",
      sourceText: "是否已经完成水文数据同步",
      resultText: JSON.stringify({
        recommended: "isHydrologyDataSynced",
        candidates: [
          { name: "isHydrologyDataSynced", meaning: "水文数据是否已同步" },
          { name: "hasHydrologySyncCompleted", meaning: "水文同步是否已完成" }
        ]
      }, null, 2),
      mode: "naming",
      sourceLanguage: "zh-CN",
      targetLanguage: "en",
      provider: "ollama",
      model: "qwen3.5:9b",
      createdAt: new Date(Date.now() - 7200_000).toISOString(),
      isFavorite: false
    }
  ];
  const documents: DocumentTaskRecord[] = [
    {
      id: "preview-doc-1",
      fileName: "architecture-notes.md",
      format: "markdown",
      totalChunks: 12,
      completedChunks: 12,
      status: "completed",
      profileId: "technical",
      model: "qwen3.5:9b",
      promptVersion: "preview",
      createdAt: Date.now() - 86_400_000,
      updatedAt: Date.now() - 86_000_000,
      sourcePath: "preview://architecture-notes.md",
      chunks: [],
      translations: {}
    },
    {
      id: "preview-doc-2",
      fileName: "release-checklist.txt",
      format: "txt",
      totalChunks: 8,
      completedChunks: 3,
      status: "translating",
      profileId: "general",
      model: "qwen3.5:9b",
      promptVersion: "preview",
      createdAt: Date.now() - 3_600_000,
      updatedAt: Date.now() - 60_000,
      sourcePath: "preview://release-checklist.txt",
      chunks: [],
      translations: {}
    }
  ];

  // Browser preview mode is deliberately separate from Electron. It supports
  // visual review without masking a missing preload inside the real app.
  window.translator = {
    runtime: {
      ping: async () => ({ apiVersion: 2, electron: "browser-preview", platform: "browser" })
    },
    settings: {
      get: async () => structuredClone(settings),
      getSnapshot: async () => ({ revision: settingsRevision, settings: structuredClone(settings) }),
      patch: async (patch) => {
        if (patch.type === "reset") settings = structuredClone(DEFAULT_SETTINGS);
        else if (patch.type === "update-provider") settings.provider = { ...settings.provider, ...patch.value };
        else if (patch.type === "update-shortcuts") settings.shortcuts = { ...settings.shortcuts, ...patch.value };
        else if (patch.type === "update-window") settings.window = { ...settings.window, ...patch.value };
        else {
          if (patch.value.translation) settings.translation = { ...settings.translation, ...patch.value.translation };
          if (patch.value.history) settings.history = { ...settings.history, ...patch.value.history };
          if (patch.value.routing) settings.routing = { ...settings.routing, ...patch.value.routing };
          if (patch.value.startup) settings.startup = { ...settings.startup, ...patch.value.startup };
        }
        settingsRevision += 1;
        return {
          snapshot: { revision: settingsRevision, settings: structuredClone(settings) },
          shortcutResult: { translation: true, naming: true, screenshot: true, errors: [] }
        };
      }
    },
    provider: {
      healthCheck: async () => ({ ok: true, message: "浏览器预览模式：界面连接正常。" }),
      getModels: async (): Promise<ProviderModel[]> => [{ id: "qwen3.5:9b", name: "qwen3.5:9b" }]
    },
    translation: {
      getSession: async () => undefined,
      openHistorySession: async () => false,
      start: async (request) => {
        const requestId = previewUuid();
        queueMicrotask(() => listeners.forEach((listener) => listener({ requestId, status: "loading" })));
        setTimeout(() => {
          const content = request.mode === "naming"
            ? JSON.stringify({
                recommended: "isHydrologyDataSynced",
                candidates: [
                  { name: "isHydrologyDataSynced", meaning: "水文数据是否已同步" },
                  { name: "hasHydrologySyncCompleted", meaning: "水文同步是否已完成" },
                  { name: "isWaterDataSyncDone", meaning: "水文数据同步是否完成" }
                ]
              })
            : "让实现保持精简，并且便于观察运行状态。";
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
        const requestId = previewUuid();
        queueMicrotask(() => revisionListeners.forEach((listener) => listener({ requestId, status: "loading" })));
        setTimeout(() => revisionListeners.forEach((listener) => listener({
          requestId,
          status: "success",
          revision: { id: previewUuid(), segmentId: request.segment.id, previousTarget: request.segment.target, newTarget: `${request.segment.target}（已按要求调整）`, instruction: request.instruction, createdAt: Date.now() }
        })), 250);
        return requestId;
      },
      cancel: () => undefined,
      onEvent: (listener) => { revisionListeners.add(listener); return () => revisionListeners.delete(listener); }
    },
    alternatives: {
      start: async (request) => {
        const requestId = previewUuid();
        queueMicrotask(() => alternativesListeners.forEach((listener) => listener({ requestId, status: "loading" })));
        setTimeout(() => alternativesListeners.forEach((listener) => listener({ requestId, status: "success", alternatives: [
          { id: previewUuid(), label: "推荐译法", target: request.segment.target, description: "兼顾准确性和自然度" },
          { id: previewUuid(), label: "直译", target: `${request.segment.target}（直译）`, description: "尽量保留原文结构" },
          { id: previewUuid(), label: "正式表达", target: `${request.segment.target}（正式）`, description: "适合报告和正式文档" }
        ] })), 300);
        return requestId;
      },
      cancel: () => undefined,
      onEvent: (listener) => { alternativesListeners.add(listener); return () => alternativesListeners.delete(listener); }
    },
    selection: {
      capture: async () => ({ text: "" }),
      triggerTip: () => undefined,
      dismissTip: () => undefined
    },
    history: {
      list: async () => structuredClone(history),
      get: async (id) => structuredClone(history.find((item) => item.id === id)),
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
      updateRevisions: async (update) => {
        const item = history.find((candidate) => candidate.id === update.id);
        if (!item) return undefined;
        item.revisions = update.revisions;
        item.resultText = update.resultText;
        item.updatedAt = new Date().toISOString();
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
      lookup: async (request) => previewDictionaryLookup(request.query),
      status: async () => ({
        available: true,
        source: "ECDICT",
        dictionaryVersion: "preview",
        schemaVersion: 1,
        entryCount: 3
      }),
      context: {
        start: async (request) => {
          const requestId = previewUuid();
          queueMicrotask(() => dictionaryContextListeners.forEach((listener) => listener({ requestId, status: "loading" })));
          setTimeout(() => dictionaryContextListeners.forEach((listener) => listener({ requestId, status: "success", explanation: `“${request.term}”可结合当前句段理解。` })), 200);
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
      list: async (): Promise<DocumentTaskRecord[]> => structuredClone(documents),
      delete: async (id) => {
        const index = documents.findIndex((item) => item.id === id);
        if (index >= 0) documents.splice(index, 1);
      },
      import: async () => undefined,
      export: async () => false,
      start: async () => undefined,
      pause: async () => undefined,
      cancel: async () => undefined,
      onEvent: () => () => undefined
    },
    privacy: { clearLocalData: async () => { history.splice(0); } },
    diagnostics: { exportReport: async () => ({ saved: false }) },
    ocr: {
      listScreens: async () => [],
      captureScreen: async () => { throw new Error("浏览器预览不支持 Windows OCR。"); },
      recognizeRegion: async () => { throw new Error("浏览器预览不支持 Windows OCR。"); },
      cancel: () => undefined,
      onCaptureRequested: () => () => undefined
    },
    clipboard: {
      writeText: async (text) => navigator.clipboard?.writeText(text)
    },
    window: {
      openMain: () => undefined,
      closePopup: () => undefined,
      pinPopup: () => undefined,
      adaptPopupHeight: () => undefined,
      onPopupPayload: (listener) => {
        popupPayloadListeners.add(listener);
        return () => popupPayloadListeners.delete(listener);
      },
      onNavigate: () => () => undefined
    }
  };

  (window as Window & { __lexiflowPreviewEmitPopup?: (payload: { text?: string; mode: "normal" | "technical" | "naming"; profileId?: string; capturing?: boolean; error?: string }) => void }).__lexiflowPreviewEmitPopup = (payload) => {
    popupPayloadListeners.forEach((listener) => listener(payload));
  };
}
