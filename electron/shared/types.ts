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
  profileId?: string;
  profilePrompt?: string;
  temperature?: number;
}

export interface GlossaryEntry {
  id: string;
  sourceTerm: string;
  targetTerm: string;
  sourceLanguage: string;
  targetLanguage: string;
  domain?: string;
  caseSensitive: boolean;
  matchMode: "exact" | "word" | "phrase";
  note?: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface GlossaryImportResult {
  imported: number;
  skipped: Array<{ row: number; reason: string }>;
}

export interface GlossaryExportResult {
  saved: boolean;
  count: number;
}

export interface GlossaryConflict {
  sourceTerm: string;
  targets: string[];
  entryIds: string[];
}

export interface GlossaryMatchValidation {
  sourceTerm: string;
  targetTerm: string;
  applied: boolean;
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
  /** When false, this Profile may only run with a local Provider. */
  allowRemote?: boolean;
  isBuiltIn: boolean;
}

export type DocumentTaskStatus = "created" | "parsing" | "translating" | "paused" | "completed" | "failed" | "cancelled";
export interface DocumentTask {
  id: string;
  fileName: string;
  format: "txt" | "markdown" | "srt" | "pdf" | "code";
  totalChunks: number;
  completedChunks: number;
  status: DocumentTaskStatus;
  profileId: string;
  model: string;
  promptVersion: string;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

export interface DocumentChunkFailure {
  error: string;
  retryable: boolean;
  failedAt: number;
}

export interface DocumentTaskRecord extends DocumentTask {
  sourcePath: string;
  chunks: Array<{ id: string; source: string; translatable: boolean; prefix?: string; suffix?: string }>;
  translations: Record<string, string>;
  /** Failed chunk ids with last error; cleared on successful retry. */
  failedChunks?: Record<string, DocumentChunkFailure>;
}
export interface DocumentImportRequest { profileId: string; }
export interface DocumentExportRequest { taskId: string; format: "translated" | "bilingual" | "json"; }
export interface DocumentTaskEvent { task: DocumentTaskRecord; }
export interface TranslationQualityIssue {
  segmentId: string;
  kind: "empty" | "number" | "unit" | "url" | "code" | "duplicate" | "language" | "glossary";
  message: string;
}
export interface OcrBlock {
  id: string;
  text: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  confidence?: number;
}
export interface OcrResult { text: string; blocks: OcrBlock[]; imageDataUrl: string; imageWidth: number; imageHeight: number; }
export interface OcrScreen { id: string; name: string; width: number; height: number; primary: boolean; }

export interface SegmentRevisionRequest {
  segment: TranslationSegment;
  instruction: string;
  targetLanguage: TargetLanguage;
  profileId?: string;
}

export interface SegmentRevision {
  id: string;
  segmentId: string;
  previousTarget: string;
  newTarget: string;
  instruction: string;
  createdAt: number;
}

export interface SegmentAlternative {
  id: string;
  label: "推荐译法" | "直译" | "正式表达";
  target: string;
  description: string;
}

export interface SegmentAlternativeRequest {
  segment: TranslationSegment;
  targetLanguage: TargetLanguage;
  profileId?: string;
}

export interface SourceSegment {
  id: string;
  source: string;
  sourceStart: number;
  sourceEnd: number;
}

export interface TranslationSegment extends SourceSegment {
  target: string;
  targetStart?: number;
  targetEnd?: number;
}

export interface TranslationModelInfo {
  provider: ProviderType;
  model: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface TranslationResult {
  requestId: string;
  sourceText: string;
  targetText: string;
  sourceLanguage: string;
  targetLanguage: string;
  segments: TranslationSegment[];
  modelInfo: TranslationModelInfo;
  promptVersion?: string;
  glossaryValidation?: GlossaryMatchValidation[];
  createdAt: number;
}

export interface TranslationChunk {
  content: string;
  done: boolean;
}

export interface ProviderModel {
  id: string;
  name: string;
}

export interface ProviderHealth {
  ok: boolean;
  message: string;
}

export interface DictionaryEntry {
  query: string;
  phonetic?: string;
  partOfSpeech?: string;
  definitions: string[];
  forms?: string[];
  collocations?: string[];
  source: "local";
}

export interface DictionaryContextRequest {
  term: string;
  source: string;
  target: string;
  targetLanguage: TargetLanguage;
  profileId?: string;
}

export interface DictionaryContextEvent {
  requestId: string;
  status: TranslationStatus;
  explanation?: string;
  error?: string;
}

export interface ProviderConfig {
  type: ProviderType;
  baseUrl: string;
  model: string;
  /** Explicit user acknowledgement required before content is sent to a remote Provider. */
  remoteUsageConfirmed?: boolean;
  apiKey?: string;
  timeoutMs: number;
  stream: boolean;
  keepAlive: string;
}

export interface ShortcutSettings {
  translation: string;
  naming: string;
  screenshot: string;
  paused: boolean;
}

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

export interface HistorySettings {
  enabled: boolean;
  maxItems: number;
  retention: "7d" | "30d" | "forever" | "clear-on-exit";
}

export interface ModelRoutingSettings {
  enabled: boolean;
  shortTextMaxLength: number;
  shortTextModel?: string;
  documentModel?: string;
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
  routing: ModelRoutingSettings;
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
  isFavorite: boolean;
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
  result?: TranslationResult;
}

export interface SegmentRevisionEvent {
  requestId: string;
  status: TranslationStatus;
  revision?: SegmentRevision;
  error?: string;
}

export interface SegmentAlternativeEvent {
  requestId: string;
  status: TranslationStatus;
  alternatives?: SegmentAlternative[];
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
  screenshot: boolean;
  errors: string[];
}

export interface RuntimeInfo {
  apiVersion: 1;
  electron: string;
  platform: string;
}

/** 主/渲染/preload 共用的 IPC 通道名；新增通道须同步 api.ts、preload、ipc/register。 */
export const IPC_CHANNELS = {
  runtimePing: "runtime:ping",
  settingsGet: "settings:get",
  settingsUpdate: "settings:update",
  providerHealth: "provider:health",
  providerModels: "provider:models",
  translationStart: "translation:start",
  translationCancel: "translation:cancel",
  translationEvent: "translation:event",
  revisionStart: "revision:start",
  revisionCancel: "revision:cancel",
  revisionEvent: "revision:event",
  alternativesStart: "alternatives:start",
  alternativesCancel: "alternatives:cancel",
  alternativesEvent: "alternatives:event",
  selectionCapture: "selection:capture",
  historyList: "history:list",
  historySearch: "history:search",
  historyToggleFavorite: "history:toggle-favorite",
  historyDelete: "history:delete",
  historyClear: "history:clear",
  dictionaryLookup: "dictionary:lookup",
  dictionaryContextStart: "dictionary:context:start",
  dictionaryContextCancel: "dictionary:context:cancel",
  dictionaryContextEvent: "dictionary:context:event",
  glossaryList: "glossary:list",
  glossaryUpsert: "glossary:upsert",
  glossaryDelete: "glossary:delete",
  glossaryConflicts: "glossary:conflicts",
  glossaryImportCsv: "glossary:import-csv",
  glossaryExportCsv: "glossary:export-csv",
  privacyClearLocalData: "privacy:clear-local-data",
  diagnosticsExport: "diagnostics:export",
  profileList: "profile:list",
  profileUpsert: "profile:upsert",
  profileDelete: "profile:delete",
  documentList: "document:list",
  documentDelete: "document:delete",
  documentImport: "document:import",
  documentExport: "document:export",
  documentStart: "document:start",
  documentPause: "document:pause",
  documentCancel: "document:cancel",
  documentEvent: "document:event",
  ocrCapture: "ocr:capture",
  ocrListScreens: "ocr:list-screens",
  ocrCaptureRequested: "ocr:capture-requested",
  shortcutRegister: "shortcut:register",
  clipboardWrite: "clipboard:write",
  windowOpenMain: "window:open-main",
  popupPayload: "popup:payload",
  popupClose: "popup:close",
  popupPin: "popup:pin"
} as const;
