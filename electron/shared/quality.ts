/**
 * 句段质量启发式（主进程 / 渲染共用）：数字、单位、URL、代码块遗漏，重复译文，语言漂移，术语未应用。
 * URL_PATTERN 不可命名为 URL，会遮蔽全局 URL 构造器导致渲染白屏。
 */
import type { GlossaryMatchValidation, TranslationQualityIssue, TranslationSegment } from "./types";

const NUMBER = /\b\d+(?:[.,]\d+)?%?\b/g;
const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/g;
const CODE_BLOCK = /```[\s\S]*?```/g;
const UNIT = /\b(?:ms|s|min|h|KB|MB|GB|TB|°C|°F|km|cm|mm|kg|g|mL|L)\b/g;
const tokens = (value: string, pattern: RegExp): string[] => [...value.matchAll(pattern)].map((match) => match[0]);

export function checkTranslationQuality(segments: TranslationSegment[], options: { targetLanguage?: string; glossaryValidation?: GlossaryMatchValidation[] } = {}): TranslationQualityIssue[] {
  const issues: TranslationQualityIssue[] = [];
  const seenTargets = new Map<string, TranslationSegment>();
  for (const segment of segments) {
    if (!segment.target.trim()) { issues.push({ segmentId: segment.id, kind: "empty", message: "该句段没有译文。" }); continue; }
    for (const [kind, pattern, label] of [["number", NUMBER, "数字"], ["unit", UNIT, "单位"], ["url", URL_PATTERN, "URL"], ["code", CODE_BLOCK, "代码块"]] as const) {
      const source = tokens(segment.source, pattern); const target = tokens(segment.target, pattern);
      if (source.some((token) => !target.includes(token))) issues.push({ segmentId: segment.id, kind, message: `该句段可能遗漏或改动了${label}。` });
    }
    const normalizedTarget = segment.target.replace(/\s+/g, " ").trim().toLocaleLowerCase();
    const previous = seenTargets.get(normalizedTarget);
    if (previous && previous.source !== segment.source) issues.push({ segmentId: segment.id, kind: "duplicate", message: "该句段与另一条不同原文的译文重复。" });
    else if (normalizedTarget) seenTargets.set(normalizedTarget, segment);
    if (options.targetLanguage === "zh-CN" && /[A-Za-z]{4,}/.test(segment.target) && !/[\u3400-\u9fff]/.test(segment.target) && /[\u3400-\u9fff]/.test(segment.source)) issues.push({ segmentId: segment.id, kind: "language", message: "译文可能仍主要使用源语言，请人工确认目标语言。" });
    if (options.targetLanguage === "en" && /[\u3400-\u9fff]/.test(segment.target) && /[A-Za-z]{4,}/.test(segment.source)) issues.push({ segmentId: segment.id, kind: "language", message: "译文可能仍主要使用源语言，请人工确认目标语言。" });
  }
  for (const glossary of options.glossaryValidation ?? []) if (!glossary.applied) issues.push({ segmentId: segments[0]?.id ?? "glossary", kind: "glossary", message: `术语“${glossary.sourceTerm}”未检测到指定译法“${glossary.targetTerm}”。` });
  return issues;
}
