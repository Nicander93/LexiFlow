/**
 * contextBridge 白名单实现，暴露为 window.translator。
 * 仅转发 IPC_CHANNELS 中的通道；与 shared/api.ts 的 TranslatorApi 保持同形。
 */
import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  type AppSettings,
  type CaptureScreenOptions,
  type CaptureScreenResult,
  type DictionaryLookupRequest,
  type DictionaryLookupResult,
  type DictionaryStatus,
  type DocumentTaskRecord,
  type DocumentTaskEvent,
  type OcrResult,
  type OcrScreen,
  type RecognizeRegionRequest,
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
  type HistoryRevisionUpdate,
  type TranslationSession,
  type TranslationRequest,
  type SettingsPatch,
  type SettingsSnapshot
  ,type TranslationProfile
  ,type VocabularyEntry
  ,type VocabularyUpsertInput
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
    getSnapshot: (): Promise<SettingsSnapshot> => ipcRenderer.invoke(IPC_CHANNELS.settingsGetSnapshot),
    patch: (patch: SettingsPatch): Promise<{
      snapshot: SettingsSnapshot;
      shortcutResult: ShortcutRegistrationResult;
    }> => ipcRenderer.invoke(IPC_CHANNELS.settingsPatch, patch)
  },
  provider: {
    healthCheck: (): Promise<ProviderHealth> => ipcRenderer.invoke(IPC_CHANNELS.providerHealth),
    getModels: () => ipcRenderer.invoke(IPC_CHANNELS.providerModels)
  },
  translation: {
    getSession: (): Promise<TranslationSession | undefined> => ipcRenderer.invoke(IPC_CHANNELS.translationSessionGet),
    openHistorySession: (historyId: string): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.translationOpenHistory, historyId),
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
    capture: (): Promise<SelectionResult> => ipcRenderer.invoke(IPC_CHANNELS.selectionCapture),
    triggerTip: (): void => ipcRenderer.send(IPC_CHANNELS.selectionTipTrigger),
    dismissTip: (): void => ipcRenderer.send(IPC_CHANNELS.selectionTipDismiss)
  },
  history: {
    list: (): Promise<TranslationHistory[]> => ipcRenderer.invoke(IPC_CHANNELS.historyList),
    get: (id: string): Promise<TranslationHistory | undefined> => ipcRenderer.invoke(IPC_CHANNELS.historyGet, id),
    search: (query: string): Promise<TranslationHistory[]> => ipcRenderer.invoke(IPC_CHANNELS.historySearch, query),
    toggleFavorite: (id: string): Promise<TranslationHistory | undefined> => ipcRenderer.invoke(IPC_CHANNELS.historyToggleFavorite, id),
    updateRevisions: (update: HistoryRevisionUpdate): Promise<TranslationHistory | undefined> => ipcRenderer.invoke(IPC_CHANNELS.historyUpdateRevisions, update),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.historyDelete, id),
    clear: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.historyClear)
  },
  dictionary: {
    lookup: (request: DictionaryLookupRequest): Promise<DictionaryLookupResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.dictionaryLookup, request),
    status: (): Promise<DictionaryStatus> => ipcRenderer.invoke(IPC_CHANNELS.dictionaryStatus),
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
  vocabulary: {
    list: (): Promise<VocabularyEntry[]> => ipcRenderer.invoke(IPC_CHANNELS.vocabularyList),
    upsert: (entry: VocabularyUpsertInput): Promise<VocabularyEntry> => ipcRenderer.invoke(IPC_CHANNELS.vocabularyUpsert, entry),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.vocabularyDelete, id),
    clear: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.vocabularyClear)
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
    captureScreen: (options?: CaptureScreenOptions): Promise<CaptureScreenResult> => ipcRenderer.invoke(IPC_CHANNELS.ocrCaptureScreen, options),
    recognizeRegion: (request: RecognizeRegionRequest): Promise<OcrResult> => ipcRenderer.invoke(IPC_CHANNELS.ocrRecognizeRegion, request),
    cancel: (captureId: string): void => ipcRenderer.send(IPC_CHANNELS.ocrCancel, captureId),
    onCaptureRequested: (listener: () => void): (() => void) => on(IPC_CHANNELS.ocrCaptureRequested, listener)
  },
  clipboard: {
    writeText: (text: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.clipboardWrite, text)
  },
  window: {
    openMain: (route?: string): void => ipcRenderer.send(IPC_CHANNELS.windowOpenMain, route),
    closePopup: (): void => ipcRenderer.send(IPC_CHANNELS.popupClose),
    pinPopup: (pinned: boolean): void => ipcRenderer.send(IPC_CHANNELS.popupPin, pinned),
    adaptPopupHeight: (kind?: "dictionary" | "translation" | "naming" | "default", contentHeight?: number): void =>
      ipcRenderer.send(IPC_CHANNELS.popupAdaptHeight, kind, contentHeight),
    onPopupPayload: (listener: (payload: PopupPayload) => void): (() => void) =>
      on(IPC_CHANNELS.popupPayload, listener),
    onNavigate: (listener: (route: string) => void): (() => void) => on(IPC_CHANNELS.navigationOpen, listener)
  }
} satisfies TranslatorApi;

contextBridge.exposeInMainWorld("translator", api);
