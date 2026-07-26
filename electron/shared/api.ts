/**
 * 渲染进程可见的 preload 白名单类型面。实现见 preload/index.ts，通道见 types.IPC_CHANNELS。
 * 新增能力必须同步改这三处，禁止在渲染侧直接 invoke 未声明通道。
 */
import type {
  AppSettings,
  DictionaryContextEvent,
  DictionaryContextRequest,
  DictionaryLookupRequest,
  DictionaryLookupResult,
  DictionaryStatus,
  GlossaryConflict,
  GlossaryEntry,
  GlossaryExportResult,
  GlossaryImportResult,
  PopupPayload,
  ProviderModel,
  ProviderHealth,
  RuntimeInfo,
  SegmentAlternativeEvent,
  SegmentAlternativeRequest,
  SegmentRevisionEvent,
  SegmentRevisionRequest,
  TranslationProfile,
  DocumentTaskRecord,
  DocumentImportRequest,
  DocumentExportRequest,
  DocumentTaskEvent,
  OcrResult,
  OcrScreen,
  SelectionResult,
  ShortcutRegistrationResult,
  TranslationEvent,
  TranslationHistory,
  TranslationRequest
} from "./types";

export interface TranslatorApi {
  runtime: {
    ping: () => Promise<RuntimeInfo>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    update: (settings: AppSettings) => Promise<{
      settings: AppSettings;
      shortcutResult: ShortcutRegistrationResult;
    }>;
  };
  provider: {
    healthCheck: () => Promise<ProviderHealth>;
    getModels: () => Promise<ProviderModel[]>;
  };
  translation: {
    start: (request: TranslationRequest) => Promise<string>;
    cancel: (requestId?: string) => void;
    onEvent: (listener: (event: TranslationEvent) => void) => () => void;
  };
  revision: {
    start: (request: SegmentRevisionRequest) => Promise<string>;
    cancel: (requestId?: string) => void;
    onEvent: (listener: (event: SegmentRevisionEvent) => void) => () => void;
  };
  alternatives: {
    start: (request: SegmentAlternativeRequest) => Promise<string>;
    cancel: (requestId?: string) => void;
    onEvent: (listener: (event: SegmentAlternativeEvent) => void) => () => void;
  };
  selection: {
    capture: () => Promise<SelectionResult>;
  };
  history: {
    list: () => Promise<TranslationHistory[]>;
    search: (query: string) => Promise<TranslationHistory[]>;
    toggleFavorite: (id: string) => Promise<TranslationHistory | undefined>;
    delete: (id: string) => Promise<void>;
    clear: () => Promise<void>;
  };
  dictionary: {
    lookup: (request: DictionaryLookupRequest) => Promise<DictionaryLookupResult>;
    status: () => Promise<DictionaryStatus>;
    context: {
      start: (request: DictionaryContextRequest) => Promise<string>;
      cancel: (requestId?: string) => void;
      onEvent: (listener: (event: DictionaryContextEvent) => void) => () => void;
    };
  };
  glossary: {
    list: () => Promise<GlossaryEntry[]>;
    upsert: (entry: GlossaryEntry) => Promise<GlossaryEntry>;
    delete: (id: string) => Promise<void>;
    conflicts: () => Promise<GlossaryConflict[]>;
    importCsv: () => Promise<GlossaryImportResult>;
    exportCsv: () => Promise<GlossaryExportResult>;
  };
  profiles: {
    list: () => Promise<TranslationProfile[]>;
    upsert: (profile: TranslationProfile) => Promise<TranslationProfile>;
    delete: (id: string) => Promise<void>;
  };
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
  privacy: { clearLocalData: () => Promise<void>; };
  diagnostics: { exportReport: () => Promise<{ saved: boolean; path?: string }>; };
  ocr: {
    listScreens: () => Promise<OcrScreen[]>;
    captureScreen: (screenId?: string) => Promise<OcrResult>;
    onCaptureRequested: (listener: () => void) => () => void;
  };
  clipboard: {
    writeText: (text: string) => Promise<void>;
  };
  window: {
    openMain: (route?: string) => void;
    closePopup: () => void;
    pinPopup: (pinned: boolean) => void;
    onPopupPayload: (listener: (payload: PopupPayload) => void) => () => void;
    onNavigate: (listener: (route: string) => void) => () => void;
  };
}
