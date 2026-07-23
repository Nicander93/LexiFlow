import type {
  AppSettings,
  ModelInfo,
  PopupPayload,
  ProviderHealth,
  RuntimeInfo,
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
    getModels: () => Promise<ModelInfo[]>;
  };
  translation: {
    start: (request: TranslationRequest) => Promise<string>;
    cancel: (requestId?: string) => void;
    onEvent: (listener: (event: TranslationEvent) => void) => () => void;
  };
  selection: {
    capture: () => Promise<SelectionResult>;
  };
  history: {
    list: () => Promise<TranslationHistory[]>;
    delete: (id: string) => Promise<void>;
    clear: () => Promise<void>;
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
