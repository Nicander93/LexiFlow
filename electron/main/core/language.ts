import type { TargetLanguage } from "../../shared/types";

/** Prefer zh only when CJK density is high enough — a few Chinese chars in English must not flip the direction. 中文字符占比够高才判 zh。 */
export function detectLanguage(text: string): "zh-CN" | "en" {
  const chineseCount = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const englishCount = (text.match(/[A-Za-z]/g) ?? []).length;
  return chineseCount >= englishCount * 0.35 ? "zh-CN" : "en";
}

/** auto flips to the other side; an explicit target is returned as-is. auto 时翻成另一边，显式指定则原样返回。 */
export function resolveTargetLanguage(text: string, target: TargetLanguage): "zh-CN" | "en" {
  if (target !== "auto") return target;
  return detectLanguage(text) === "zh-CN" ? "en" : "zh-CN";
}
