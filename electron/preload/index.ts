/**
 * contextBridge 白名单实现，暴露为 window.translator。
 * 仅转发 IPC_CHANNELS 中的通道；与 shared/api.ts 的 TranslatorApi 保持同形。
 */
import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  type AppSettings,
  type DictionaryEntry,
  type DocumentTaskRecord,
  type DocumentTaskEvent,
  type OcrResult,
  type OcrScreen,
  type DocumentImportRequest,
  type DocumentExportRequest,
  type GlossaryConflict,
  type GlossaryExportResult,
  type GlossaryImportResult,
  type GlossaryEntry,
  type PopupPayload,
  type ProviderHealth,
  type RuntimeInfo,
  type SegmentRevisionEvent,
  type SegmentRevisionRequest,
  type SegmentAlternativeEvent,
  type SegmentAlternativeRequest,
  type SelectionResult,
  type ShortcutRegistrationResult,
  type TranslationEvent,
  type TranslationHistory,
  type TranslationRequest
  ,type TranslationProfile
} from "../shared/types";
import type { TranslatorApi } from "../shared/api";

const on = <T>(channel: string, listener: (payload: T) => void): (() => void) => {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

const api = {
  runtime: {
    ping: (): Promise<RuntimeInfo> => ipcRenderer.invoke(IPC_CHANNELS.runtimePing)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
    update: (settings: AppSettings): Promise<{
      settings: AppSettings;
      shortcutResult: ShortcutRegistrationResult;
    }> => ipcRenderer.invoke(IPC_CHANNELS.settingsUpdate, settings)
  },
  provider: {
    healthCheck: (): Promise<ProviderHealth> => ipcRenderer.invoke(IPC_CHANNELS.providerHealth),
    getModels: () => ipcRenderer.invoke(IPC_CHANNELS.providerModels)
  },
  translation: {
    start: (request: TranslationRequest): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.translationStart, request),
    cancel: (requestId?: string): void => ipcRenderer.send(IPC_CHANNELS.translationCancel, requestId),
    onEvent: (listener: (event: TranslationEvent) => void): (() => void) =>
      on(IPC_CHANNELS.translationEvent, listener)
  },
  revision: {
    start: (request: SegmentRevisionRequest): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.revisionStart, request),
    cancel: (requestId?: string): void => ipcRenderer.send(IPC_CHANNELS.revisionCancel, requestId),
    onEvent: (listener: (event: SegmentRevisionEvent) => void): (() => void) => on(IPC_CHANNELS.revisionEvent, listener)
  },
  alternatives: {
    start: (request: SegmentAlternativeRequest): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.alternativesStart, request),
    cancel: (requestId?: string): void => ipcRenderer.send(IPC_CHANNELS.alternativesCancel, requestId),
    onEvent: (listener: (event: SegmentAlternativeEvent) => void): (() => void) => on(IPC_CHANNELS.alternativesEvent, listener)
  },
  selection: {
    capture: (): Promise<SelectionResult> => ipcRenderer.invoke(IPC_CHANNELS.selectionCapture)
  },
  history: {
    list: (): Promise<TranslationHistory[]> => ipcRenderer.invoke(IPC_CHANNELS.historyList),
    search: (query: string): Promise<TranslationHistory[]> => ipcRenderer.invoke(IPC_CHANNELS.historySearch, query),
    toggleFavorite: (id: string): Promise<TranslationHistory | undefined> => ipcRenderer.invoke(IPC_CHANNELS.historyToggleFavorite, id),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.historyDelete, id),
    clear: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.historyClear)
  },
  dictionary: {
    lookup: (term: string): Promise<DictionaryEntry | undefined> => ipcRenderer.invoke(IPC_CHANNELS.dictionaryLookup, term),
    context: {
      start: (request) => ipcRenderer.invoke(IPC_CHANNELS.dictionaryContextStart, request),
      cancel: (requestId?: string) => ipcRenderer.send(IPC_CHANNELS.dictionaryContextCancel, requestId),
      onEvent: (listener) => on(IPC_CHANNELS.dictionaryContextEvent, listener)
    }
  },
  glossary: {
    list: (): Promise<GlossaryEntry[]> => ipcRenderer.invoke(IPC_CHANNELS.glossaryList),
    upsert: (entry: GlossaryEntry): Promise<GlossaryEntry> => ipcRenderer.invoke(IPC_CHANNELS.glossaryUpsert, entry),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.glossaryDelete, id),
    conflicts: (): Promise<GlossaryConflict[]> => ipcRenderer.invoke(IPC_CHANNELS.glossaryConflicts),
    importCsv: (): Promise<GlossaryImportResult> => ipcRenderer.invoke(IPC_CHANNELS.glossaryImportCsv),
    exportCsv: (): Promise<GlossaryExportResult> => ipcRenderer.invoke(IPC_CHANNELS.glossaryExportCsv)
  },
  profiles: {
    list: (): Promise<TranslationProfile[]> => ipcRenderer.invoke(IPC_CHANNELS.profileList),
    upsert: (profile: TranslationProfile): Promise<TranslationProfile> => ipcRenderer.invoke(IPC_CHANNELS.profileUpsert, profile),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.profileDelete, id)
  },
  documents: {
    list: (): Promise<DocumentTaskRecord[]> => ipcRenderer.invoke(IPC_CHANNELS.documentList),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.documentDelete, id),
    import: (request: DocumentImportRequest): Promise<DocumentTaskRecord | undefined> => ipcRenderer.invoke(IPC_CHANNELS.documentImport, request),
    export: (request: DocumentExportRequest): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.documentExport, request)
    ,start: (taskId: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.documentStart, taskId)
    ,pause: (taskId: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.documentPause, taskId)
    ,cancel: (taskId: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.documentCancel, taskId)
    ,onEvent: (listener: (event: DocumentTaskEvent) => void): (() => void) => on(IPC_CHANNELS.documentEvent, listener)
  },
  privacy: { clearLocalData: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.privacyClearLocalData) },
  diagnostics: {
    exportReport: (): Promise<{ saved: boolean; path?: string }> => ipcRenderer.invoke(IPC_CHANNELS.diagnosticsExport)
  },
  ocr: {
    listScreens: (): Promise<OcrScreen[]> => ipcRenderer.invoke(IPC_CHANNELS.ocrListScreens),
    captureScreen: (screenId?: string): Promise<OcrResult> => ipcRenderer.invoke(IPC_CHANNELS.ocrCapture, screenId),
    onCaptureRequested: (listener: () => void): (() => void) => on(IPC_CHANNELS.ocrCaptureRequested, listener)
  },
  clipboard: {
    writeText: (text: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.clipboardWrite, text)
  },
  window: {
    openMain: (route?: string): void => ipcRenderer.send(IPC_CHANNELS.windowOpenMain, route),
    closePopup: (): void => ipcRenderer.send(IPC_CHANNELS.popupClose),
    pinPopup: (pinned: boolean): void => ipcRenderer.send(IPC_CHANNELS.popupPin, pinned),
    onPopupPayload: (listener: (payload: PopupPayload) => void): (() => void) =>
      on(IPC_CHANNELS.popupPayload, listener),
    onNavigate: (listener: (route: string) => void): (() => void) => on("navigation:open", listener)
  }
} satisfies TranslatorApi;

contextBridge.exposeInMainWorld("translator", api);
