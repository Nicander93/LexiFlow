import type { GlossaryMatchValidation } from "./glossary";
import type { ProviderType } from "./settings";

export type TranslationMode = "normal" | "technical" | "naming";
export type TargetLanguage = "auto" | "zh-CN" | "en";
export type NamingType = "variable" | "boolean" | "method" | "class" | "interface" | "database_field" | "constant" | "file" | "api_path";
export type NamingStyle = "camelCase" | "PascalCase" | "snake_case" | "SCREAMING_SNAKE_CASE" | "kebab-case";
export type ProgrammingLanguage = "java" | "typescript" | "javascript" | "python" | "sql" | "general";

export interface NamingOptions { type: NamingType; style: NamingStyle; language: ProgrammingLanguage; }
export interface NamingCandidate { name: string; meaning: string; }
export interface NamingResult { recommended: string; candidates: NamingCandidate[]; }
export type TranslationSurface = "main" | "popup" | "ocr" | "history";

export interface TranslationRequest {
  text: string;
  sourceLanguage?: string;
  targetLanguage: TargetLanguage;
  mode: TranslationMode;
  context?: string;
  glossary?: Record<string, string>;
  namingOptions?: NamingOptions;
  profileId?: string;
  profilePrompt?: string;
  temperature?: number;
  surface?: TranslationSurface;
}

export interface TranslationProfile {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  sourceLanguage: string | "auto";
  targetLanguage: TargetLanguage;
  temperature?: number;
  preserveMarkdown: boolean;
  preserveCode: boolean;
  enableGlossary: boolean;
  dictionaryMode: "off" | "basic" | "contextual";
  modelId?: string;
  allowRemote?: boolean;
  isBuiltIn: boolean;
}

export interface SegmentRevisionRequest { segment: TranslationSegment; instruction: string; targetLanguage: TargetLanguage; profileId?: string; profilePrompt?: string; }
export interface SegmentRevision { id: string; segmentId: string; previousTarget: string; newTarget: string; instruction: string; createdAt: number; }
export interface SegmentAlternative { id: string; label: "推荐译法" | "直译" | "正式表达"; target: string; description: string; }
export interface SegmentAlternativeRequest { segment: TranslationSegment; targetLanguage: TargetLanguage; profileId?: string; profilePrompt?: string; }

export interface SourceSegment { id: string; source: string; sourceStart: number; sourceEnd: number; paragraphIndex?: number; boundaryAfter?: SegmentBoundary; }
export type SegmentBoundary = "inline" | "sentence" | "line" | "paragraph" | "block";
export interface TranslationSegment extends SourceSegment { target: string; targetStart?: number; targetEnd?: number; }

export interface TranslationModelInfo { provider: ProviderType; model: string; durationMs: number; inputTokens?: number; outputTokens?: number; }
export interface TranslationResult {
  requestId: string;
  sourceText: string;
  originalSourceText?: string;
  targetText: string;
  sourceLanguage: string;
  targetLanguage: string;
  segments: TranslationSegment[];
  modelInfo: TranslationModelInfo;
  promptVersion?: string;
  glossaryValidation?: GlossaryMatchValidation[];
  createdAt: number;
  cleanupActions?: CleanupAction[];
}
export type CleanupActionType = "normalize-line-breaks" | "remove-soft-wraps" | "normalize-spaces" | "protect-code-block";
export interface CleanupAction { type: CleanupActionType; description: string; }
export interface PreparedTranslationInput { originalText: string; normalizedText: string; cleanupActions: CleanupAction[]; }
export interface TranslationChunk { content: string; done: boolean; }

export type TranslationStatus = "idle" | "capturing" | "loading" | "streaming" | "success" | "empty" | "error" | "cancelled";
export interface TranslationSession {
  id: string;
  source: TranslationSurface;
  sourceText: string;
  resultText: string;
  segments: TranslationSegment[];
  status: TranslationStatus;
  profileId: string;
  targetLanguage: TargetLanguage;
  requestId?: string;
  historyId?: string;
  createdAt: number;
  updatedAt: number;
}
export interface TranslationState { requestId?: string; status: TranslationStatus; content: string; result?: TranslationResult; error?: string; warning?: string; historyId?: string; }
export interface TranslationEvent {
  requestId: string;
  status: TranslationStatus;
  content?: string;
  error?: string;
  warning?: string;
  result?: TranslationResult;
  historyId?: string;
  segment?: TranslationSegment;
}
export interface SegmentRevisionEvent { requestId: string; status: TranslationStatus; revision?: SegmentRevision; error?: string; }
export interface SegmentAlternativeEvent { requestId: string; status: TranslationStatus; alternatives?: SegmentAlternative[]; error?: string; }
