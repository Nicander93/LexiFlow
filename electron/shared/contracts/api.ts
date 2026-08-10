import type { AppSettings, SettingsPatch, SettingsSnapshot } from "./settings";
import type { CaptureScreenOptions, CaptureScreenResult, OcrResult, OcrScreen, RecognizeRegionRequest } from "./ocr";
import type { DictionaryContextEvent, DictionaryContextRequest, DictionaryLookupRequest, DictionaryLookupResult, DictionaryStatus } from "./dictionary";
import type { GlossaryConflict, GlossaryEntry, GlossaryExportResult, GlossaryImportResult } from "./glossary";
import type { PopupPayload } from "./window";
import type { ProviderHealth, ProviderModel, RuntimeInfo, SelectionResult, ShortcutRegistrationResult } from "./runtime";
import type { SegmentAlternativeEvent, SegmentAlternativeRequest, SegmentRevisionEvent, SegmentRevisionRequest, TranslationEvent, TranslationProfile, TranslationRequest, TranslationSession } from "./translation";
import type { DocumentExportRequest, DocumentImportRequest, DocumentTaskEvent, DocumentTaskRecord } from "./document";
import type { HistoryRevisionUpdate, TranslationHistory } from "./history";

export interface TranslatorApi {
  runtime: { ping: () => Promise<RuntimeInfo> };
  settings: {
    get: () => Promise<AppSettings>;
    getSnapshot: () => Promise<SettingsSnapshot>;
    patch: (patch: SettingsPatch) => Promise<{ snapshot: SettingsSnapshot; shortcutResult: ShortcutRegistrationResult }>;
  };
  provider: { healthCheck: () => Promise<ProviderHealth>; getModels: () => Promise<ProviderModel[]> };
  translation: {
    getSession: () => Promise<TranslationSession | undefined>;
    openHistorySession: (historyId: string) => Promise<boolean>;
    start: (request: TranslationRequest) => Promise<string>;
    cancel: (requestId?: string) => void;
    onEvent: (listener: (event: TranslationEvent) => void) => () => void;
  };
  revision: { start: (request: SegmentRevisionRequest) => Promise<string>; cancel: (requestId?: string) => void; onEvent: (listener: (event: SegmentRevisionEvent) => void) => () => void };
  alternatives: { start: (request: SegmentAlternativeRequest) => Promise<string>; cancel: (requestId?: string) => void; onEvent: (listener: (event: SegmentAlternativeEvent) => void) => () => void };
  selection: { capture: () => Promise<SelectionResult>; triggerTip: () => void; dismissTip: () => void };
  history: {
    list: () => Promise<TranslationHistory[]>;
    get: (id: string) => Promise<TranslationHistory | undefined>;
    search: (query: string) => Promise<TranslationHistory[]>;
    toggleFavorite: (id: string) => Promise<TranslationHistory | undefined>;
    updateRevisions: (update: HistoryRevisionUpdate) => Promise<TranslationHistory | undefined>;
    delete: (id: string) => Promise<void>;
    clear: () => Promise<void>;
  };
  dictionary: {
    lookup: (request: DictionaryLookupRequest) => Promise<DictionaryLookupResult>;
    status: () => Promise<DictionaryStatus>;
    context: { start: (request: DictionaryContextRequest) => Promise<string>; cancel: (requestId?: string) => void; onEvent: (listener: (event: DictionaryContextEvent) => void) => () => void };
  };
  glossary: {
    list: () => Promise<GlossaryEntry[]>;
    upsert: (entry: GlossaryEntry) => Promise<GlossaryEntry>;
    delete: (id: string) => Promise<void>;
    conflicts: () => Promise<GlossaryConflict[]>;
    importCsv: () => Promise<GlossaryImportResult>;
    exportCsv: () => Promise<GlossaryExportResult>;
  };
  profiles: { list: () => Promise<TranslationProfile[]>; upsert: (profile: TranslationProfile) => Promise<TranslationProfile>; delete: (id: string) => Promise<void> };
  documents: {
    list: () => Promise<DocumentTaskRecord[]>;
    delete: (id: string) => Promise<void>;
    import: (request: DocumentImportRequest) => Promise<DocumentTaskRecord | undefined>;
    export: (request: DocumentExportRequest) => Promise<boolean>;
    start: (taskId: string) => Promise<void>;
    pause: (taskId: string) => Promise<void>;
    cancel: (taskId: string) => Promise<void>;
    onEvent: (listener: (event: DocumentTaskEvent) => void) => () => void;
  };
  privacy: { clearLocalData: () => Promise<void> };
  diagnostics: { exportReport: () => Promise<{ saved: boolean; path?: string }> };
  ocr: {
    listScreens: () => Promise<OcrScreen[]>;
    captureScreen: (options?: CaptureScreenOptions) => Promise<CaptureScreenResult>;
    recognizeRegion: (request: RecognizeRegionRequest) => Promise<OcrResult>;
    cancel: (captureId: string) => void;
    onCaptureRequested: (listener: () => void) => () => void;
  };
  clipboard: { writeText: (text: string) => Promise<void> };
  window: {
    openMain: (route?: string) => void;
    closePopup: () => void;
    pinPopup: (pinned: boolean) => void;
    adaptPopupHeight: (kind?: "dictionary" | "translation" | "naming" | "default", contentHeight?: number) => void;
    onPopupPayload: (listener: (payload: PopupPayload) => void) => () => void;
    onNavigate: (listener: (route: string) => void) => () => void;
  };
}
