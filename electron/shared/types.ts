export type TranslationMode = "normal" | "technical" | "naming";
export type TargetLanguage = "auto" | "zh-CN" | "en";
export type ProviderType = "ollama" | "openai-compatible";
export type NamingType =
  | "variable"
  | "boolean"
  | "method"
  | "class"
  | "interface"
  | "database_field"
  | "constant"
  | "file"
  | "api_path";
export type NamingStyle =
  | "camelCase"
  | "PascalCase"
  | "snake_case"
  | "SCREAMING_SNAKE_CASE"
  | "kebab-case";
export type ProgrammingLanguage =
  | "java"
  | "typescript"
  | "javascript"
  | "python"
  | "sql"
  | "general";

export interface NamingOptions {
  type: NamingType;
  style: NamingStyle;
  language: ProgrammingLanguage;
}

export interface TranslationRequest {
  text: string;
  sourceLanguage?: string;
  targetLanguage: TargetLanguage;
  mode: TranslationMode;
  context?: string;
  glossary?: Record<string, string>;
  namingOptions?: NamingOptions;
}

export interface TranslationChunk {
  content: string;
  done: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
}

export interface ProviderHealth {
  ok: boolean;
  message: string;
}

export interface ProviderConfig {
  type: ProviderType;
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs: number;
  stream: boolean;
  keepAlive: string;
}

export interface ShortcutSettings {
  translation: string;
  naming: string;
  paused: boolean;
}

export interface TranslationSettings {
  targetLanguage: TargetLanguage;
  maxInputLength: number;
  normalPrompt: string;
  technicalPrompt: string;
  namingPrompt: string;
}

export interface HistorySettings {
  enabled: boolean;
  maxItems: number;
}

export interface WindowSettings {
  closeAction: "hide" | "quit";
  autoHidePopup: boolean;
}

export interface AppSettings {
  provider: ProviderConfig;
  shortcuts: ShortcutSettings;
  translation: TranslationSettings;
  history: HistorySettings;
  window: WindowSettings;
  startup: {
    enabled: boolean;
  };
}

export interface TranslationHistory {
  id: string;
  sourceText: string;
  resultText: string;
  mode: TranslationMode;
  sourceLanguage?: string;
  targetLanguage: string;
  provider: ProviderType;
  model: string;
  createdAt: string;
}

export interface NamingCandidate {
  name: string;
  meaning: string;
}

export interface NamingResult {
  recommended: string;
  candidates: NamingCandidate[];
}

export type TranslationStatus =
  | "idle"
  | "capturing"
  | "loading"
  | "streaming"
  | "success"
  | "empty"
  | "error"
  | "cancelled";

export interface TranslationEvent {
  requestId: string;
  status: TranslationStatus;
  content?: string;
  error?: string;
}

export interface SelectionResult {
  text: string;
  error?: string;
}

export interface PopupPayload {
  mode: TranslationMode;
  text?: string;
  error?: string;
  capturing?: boolean;
}

export interface ShortcutRegistrationResult {
  translation: boolean;
  naming: boolean;
  errors: string[];
}

export interface RuntimeInfo {
  apiVersion: 1;
  electron: string;
  platform: string;
}

export const IPC_CHANNELS = {
  runtimePing: "runtime:ping",
  settingsGet: "settings:get",
  settingsUpdate: "settings:update",
  providerHealth: "provider:health",
  providerModels: "provider:models",
  translationStart: "translation:start",
  translationCancel: "translation:cancel",
  translationEvent: "translation:event",
  selectionCapture: "selection:capture",
  historyList: "history:list",
  historyDelete: "history:delete",
  historyClear: "history:clear",
  shortcutRegister: "shortcut:register",
  clipboardWrite: "clipboard:write",
  windowOpenMain: "window:open-main",
  popupPayload: "popup:payload",
  popupClose: "popup:close",
  popupPin: "popup:pin"
} as const;
