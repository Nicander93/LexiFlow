import type { TargetLanguage } from "./translation";

export type ProviderType = "ollama" | "openai-compatible";
export interface ProviderConfig {
  type: ProviderType;
  baseUrl: string;
  model: string;
  remoteUsageConfirmed?: boolean;
  enableReasoning?: boolean;
  apiKey?: string;
  apiKeyConfigured?: boolean;
  timeoutMs: number;
  stream: boolean;
  keepAlive: string;
}
export interface ShortcutSettings { translation: string; naming: string; screenshot: string; paused: boolean; enableSelectionTranslation: boolean; defaultTranslationProfileId: string; }
export interface TranslationSettings {
  targetLanguage: TargetLanguage;
  maxInputLength: number;
  autoCleanText: boolean;
  preserveOriginalLineBreaks: boolean;
  protectCodeBlocks: boolean;
  normalPrompt: string;
  technicalPrompt: string;
  namingPrompt: string;
}
export interface HistorySettings { enabled: boolean; maxItems: number; retention: "7d" | "30d" | "forever" | "clear-on-exit"; }
export interface ModelRoutingSettings { enabled: boolean; shortTextMaxLength: number; shortTextModel?: string; documentModel?: string; }
export interface WindowSettings { closeAction: "hide" | "quit"; autoHidePopup: boolean; fontSize: number; popupBounds?: { width: number; height: number }; }
export interface AppSettings { provider: ProviderConfig; shortcuts: ShortcutSettings; translation: TranslationSettings; history: HistorySettings; routing: ModelRoutingSettings; window: WindowSettings; startup: { enabled: boolean }; }
export interface SettingsSnapshot { revision: number; settings: AppSettings; }
export interface GeneralSettingsPatch { translation?: Partial<AppSettings["translation"]>; history?: Partial<AppSettings["history"]>; routing?: Partial<AppSettings["routing"]>; startup?: Partial<AppSettings["startup"]>; }
export type SettingsPatch =
  | { type: "update-general"; value: GeneralSettingsPatch }
  | { type: "update-shortcuts"; value: Partial<AppSettings["shortcuts"]> }
  | { type: "update-provider"; value: Partial<AppSettings["provider"]> }
  | { type: "update-window"; value: Partial<AppSettings["window"]> }
  | { type: "reset" };
