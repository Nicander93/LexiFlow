/**
 * 将 Profile + Request 解析为唯一翻译策略。
 * 翻译风格以 Profile 为准；mode 仅保留 naming 任务与历史兼容语义。
 */
import type {
  AppSettings,
  TargetLanguage,
  TranslationMode,
  TranslationProfile,
  TranslationRequest
} from "../../shared/types";

export type TranslationTaskType = "translation" | "naming";
export type DictionaryMode = TranslationProfile["dictionaryMode"];

export interface ResolvedTranslationPolicy {
  taskType: TranslationTaskType;
  profileId: string;
  systemPrompt: string;
  targetLanguage: TargetLanguage;
  temperature?: number;
  modelId?: string;
  allowRemote: boolean;
  dictionaryMode: DictionaryMode;
  enableGlossary: boolean;
  preserveMarkdown: boolean;
  preserveCode: boolean;
  /** 写入历史记录的兼容 mode */
  historyMode: TranslationMode;
}

const PROFILE_HISTORY_MODE: Record<string, TranslationMode> = {
  technical: "technical",
  "code-comment": "technical"
};

function fallbackPrompt(settings: AppSettings, mode: TranslationMode): string {
  if (mode === "technical") return settings.translation.technicalPrompt;
  return settings.translation.normalPrompt;
}

function historyModeFor(profileId: string, mode: TranslationMode): TranslationMode {
  if (mode === "naming") return "naming";
  return PROFILE_HISTORY_MODE[profileId] ?? "normal";
}

export function resolveTranslationPolicy(
  settings: AppSettings,
  profile: TranslationProfile | undefined,
  request: Pick<TranslationRequest, "mode" | "targetLanguage" | "profileId" | "profilePrompt">
): ResolvedTranslationPolicy {
  if (request.mode === "naming") {
    return {
      taskType: "naming",
      profileId: profile?.id ?? request.profileId ?? "general",
      systemPrompt: settings.translation.namingPrompt,
      targetLanguage: "en",
      temperature: profile?.temperature,
      modelId: profile?.modelId,
      allowRemote: profile?.allowRemote !== false,
      dictionaryMode: "off",
      enableGlossary: false,
      preserveMarkdown: false,
      preserveCode: true,
      historyMode: "naming"
    };
  }

  const profileId = profile?.id ?? request.profileId ?? (request.mode === "technical" ? "technical" : "general");
  const systemPrompt = profile?.systemPrompt
    ?? request.profilePrompt
    ?? fallbackPrompt(settings, request.mode === "technical" ? "technical" : "normal");
  const targetLanguage = profile && profile.targetLanguage !== "auto"
    ? profile.targetLanguage
    : request.targetLanguage;

  return {
    taskType: "translation",
    profileId,
    systemPrompt,
    targetLanguage,
    temperature: profile?.temperature,
    modelId: profile?.modelId,
    allowRemote: profile?.allowRemote !== false,
    dictionaryMode: profile?.dictionaryMode ?? "basic",
    enableGlossary: profile?.enableGlossary !== false,
    preserveMarkdown: profile?.preserveMarkdown === true,
    preserveCode: profile?.preserveCode !== false,
    historyMode: historyModeFor(profileId, request.mode)
  };
}

/** UI 快捷入口：普通/技术对应内置 Profile。 */
export function profileIdForModeShortcut(mode: Exclude<TranslationMode, "naming">): string {
  return mode === "technical" ? "technical" : "general";
}

export function modeShortcutForProfile(profileId: string): Exclude<TranslationMode, "naming"> {
  return profileId === "technical" || profileId === "code-comment" ? "technical" : "normal";
}
