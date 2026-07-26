/**
 * Builds system+user prompts for translation / revision / alternatives / dictionary.
 * 组装翻译 / 重译 / 候选 / 词典的 system+user。
 * 句段模式要求按本地 segmentId 回 JSON；候选固定三个标签。
 * 改规则时同步 structured schema、UI，并 bump PROMPT_VERSION。
 */
import { resolveTargetLanguage } from "./language";
import type { AppSettings, DictionaryContextRequest, SourceSegment, TranslationRequest } from "../../shared/types";
import type { SegmentAlternativeRequest, SegmentRevisionRequest } from "../../shared/types";

const LANGUAGE_LABELS = { "zh-CN": "简体中文", en: "英文" } as const;

export interface PromptMessages {
  system: string;
  user: string;
  targetLanguage: "zh-CN" | "en";
}

/** Segment mode forces JSON aligned to local IDs; naming uses its own prompt and throws if namingOptions is missing. 有 segments 时强制 JSON 对齐；命名缺 namingOptions 直接抛。 */
export function buildPrompt(
  request: TranslationRequest,
  settings: AppSettings,
  segments?: SourceSegment[]
): PromptMessages {
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
  const system = request.profilePrompt ?? (request.mode === "technical"
    ? settings.translation.technicalPrompt
    : settings.translation.normalPrompt);
  if (!segments?.length) {
    return {
      system,
      user: `目标语言：${LANGUAGE_LABELS[targetLanguage]}${request.glossary && Object.keys(request.glossary).length ? `\n术语表（必须遵守）：${JSON.stringify(request.glossary)}` : ""}\n\n${request.text}`,
      targetLanguage
    };
  }
  return {
    system: `${system}\n7. 按用户提供的 segment ID 翻译，不得合并、拆分、改写 ID。\n8. 仅返回合法 JSON：{"segments":[{"id":"segment ID","target":"译文"}]}，不要使用 Markdown 代码块。`,
    user: `目标语言：${LANGUAGE_LABELS[targetLanguage]}${request.glossary && Object.keys(request.glossary).length ? `\n术语表（必须遵守）：${JSON.stringify(request.glossary)}` : ""}\n\n${JSON.stringify({ segments: segments.map(({ id, source }) => ({ id, source })) })}`,
    targetLanguage
  };
}

/** Plain-text revision only, so the result can be written back into the segment. 只要纯文本新译文，方便直接写回句段。 */
export function buildRevisionPrompt(request: SegmentRevisionRequest, settings: AppSettings): PromptMessages {
  const targetLanguage = resolveTargetLanguage(request.segment.source, request.targetLanguage);
  return {
    system: `${settings.translation.normalPrompt}\n你正在重译一个句段。只返回新的完整译文，不要解释、不要 Markdown、不要 JSON。`,
    user: `目标语言：${LANGUAGE_LABELS[targetLanguage]}\n原文：${request.segment.source}\n当前译文：${request.segment.target}\n要求：${request.instruction}`,
    targetLanguage
  };
}

/** Labels must be 推荐译法 / 直译 / 正式表达 — kept in sync with validateAlternativesResponse. */
export function buildAlternativesPrompt(request: SegmentAlternativeRequest, settings: AppSettings): PromptMessages {
  const targetLanguage = resolveTargetLanguage(request.segment.source, request.targetLanguage);
  return {
    system: `${settings.translation.normalPrompt}\n只返回合法 JSON：{"alternatives":[{"label":"推荐译法","target":"...","description":"..."},{"label":"直译","target":"...","description":"..."},{"label":"正式表达","target":"...","description":"..."}]}。不要 Markdown。`,
    user: `目标语言：${LANGUAGE_LABELS[targetLanguage]}\n原文：${request.segment.source}\n当前译文：${request.segment.target}\n生成三个不同风格的候选译法。`,
    targetLanguage
  };
}

/** Explain the term in this segment only; do not restate the whole sentence. 只解释当前句段里的含义，避免复述整句。 */
export function buildDictionaryContextPrompt(request: DictionaryContextRequest, settings: AppSettings): PromptMessages {
  const targetLanguage = resolveTargetLanguage(request.source, request.targetLanguage);
  return {
    system: `${settings.translation.normalPrompt}\n你正在补充词典的上下文释义。只用 1 至 2 句说明该词在当前句段中的含义或译法依据；不要重复整句，不要使用 Markdown。`,
    user: `目标语言：${LANGUAGE_LABELS[targetLanguage]}\n查询词：${request.term}\n原文句段：${request.source}\n对应译文：${request.target}`,
    targetLanguage
  };
}
