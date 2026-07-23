import type { TargetLanguage } from "../../shared/types";

export function detectLanguage(text: string): "zh-CN" | "en" {
  const chineseCount = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const englishCount = (text.match(/[A-Za-z]/g) ?? []).length;
  return chineseCount >= englishCount * 0.35 ? "zh-CN" : "en";
}

export function resolveTargetLanguage(text: string, target: TargetLanguage): "zh-CN" | "en" {
  if (target !== "auto") return target;
  return detectLanguage(text) === "zh-CN" ? "en" : "zh-CN";
}
