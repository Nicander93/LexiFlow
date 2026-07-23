import { resolveTargetLanguage } from "./language";
import type { AppSettings, TranslationRequest } from "../../shared/types";

const LANGUAGE_LABELS = { "zh-CN": "简体中文", en: "英文" } as const;

export interface PromptMessages {
  system: string;
  user: string;
  targetLanguage: "zh-CN" | "en";
}

export function buildPrompt(request: TranslationRequest, settings: AppSettings): PromptMessages {
  const targetLanguage = resolveTargetLanguage(request.text, request.targetLanguage);
  if (request.mode === "naming") {
    const options = request.namingOptions;
    if (!options) throw new Error("编程命名参数不完整。 ");
    return {
      system: settings.translation.namingPrompt,
      user: `语义：${request.text}\n命名类型：${options.type}\n命名风格：${options.style}\n编程语言：${options.language}`,
      targetLanguage
    };
  }
  const system = request.mode === "technical"
    ? settings.translation.technicalPrompt
    : settings.translation.normalPrompt;
  return {
    system,
    user: `目标语言：${LANGUAGE_LABELS[targetLanguage]}\n\n${request.text}`,
    targetLanguage
  };
}
