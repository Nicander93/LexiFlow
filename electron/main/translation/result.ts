/**
 * 将模型原文组装为 TranslationResult。
 * 句段 JSON 完整通过时保留联动；否则尽量抽出 target 作全文译文，不在渲染侧做文本相似度重匹配。
 */
import type {
  SourceSegment,
  TranslationModelInfo,
  TranslationResult,
  TranslationSegment,
  GlossaryMatchValidation
} from "../../shared/types";
import { fallbackSegmentTargetText, validateSegmentResponse } from "../core/structured";

export function createTranslationResult(options: {
  requestId: string;
  sourceText: string;
  originalSourceText?: string;
  sourceLanguage: string;
  targetLanguage: string;
  sourceSegments: SourceSegment[];
  modelInfo: TranslationModelInfo;
  promptVersion?: string;
  responseText: string;
  glossaryValidation?: GlossaryMatchValidation[];
  cleanupActions?: TranslationResult["cleanupActions"];
  createdAt?: number;
  segments?: TranslationSegment[];
}): TranslationResult {
  const parsed = options.segments?.length
    ? { ok: true as const, segments: options.segments, targetText: options.segments.map((segment) => segment.target).join("\n") }
    : validateSegmentResponse(options.responseText, options.sourceSegments);
  const segments = parsed.ok ? parsed.segments : [];
  const targetText = parsed.ok
    ? parsed.targetText
    : (fallbackSegmentTargetText(options.responseText) ?? options.responseText.trim());
  return {
    requestId: options.requestId,
    sourceText: options.sourceText,
    originalSourceText: options.originalSourceText ?? options.sourceText,
    targetText,
    sourceLanguage: options.sourceLanguage,
    targetLanguage: options.targetLanguage,
    segments,
    modelInfo: options.modelInfo,
    promptVersion: options.promptVersion,
    glossaryValidation: options.glossaryValidation,
    cleanupActions: options.cleanupActions,
    createdAt: options.createdAt ?? Date.now()
  };
}
