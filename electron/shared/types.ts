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

export type DictionaryMatchType =
  | "exact"
  | "normalized"
  | "lemma"
  | "fuzzy"
  | "none";

export interface DictionarySense {
  partOfSpeech?: string;
  translations: string[];
  definitions?: string[];
}

export interface DictionaryForm {
  code: string;
  label: string;
  value: string;
}

export interface DictionaryLabels {
  exams: string[];
  collinsStars?: number;
  oxford3000: boolean;
  bncRank?: number;
  contemporaryRank?: number;
}

export interface DictionaryEntry {
  headword: string;
  phonetic?: string;
  senses: DictionarySense[];
  forms: DictionaryForm[];
  labels: DictionaryLabels;
}

export interface DictionaryLookupRequest {
  query: string;
}

export interface DictionaryLookupResult {
  query: string;
  normalizedQuery: string;
  found: boolean;
  matchType: DictionaryMatchType;
  entry?: DictionaryEntry;
  suggestions: string[];
  unavailableReason?: string;
}

export interface DictionaryStatus {
  available: boolean;
  source: "ECDICT";
  dictionaryVersion?: string;
  schemaVersion?: number;
  entryCount?: number;
  message?: string;
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
  /** When true, allow model thinking/reasoning; default false for translation latency. */
  enableReasoning?: boolean;
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
  apiVersion: 2;
  electron: string;
  platform: string;
}

/**
 * 主/渲染/preload 共用的 IPC 通道名。
 * 新增通道须同步改：api.ts（契约）、preload（白名单）、ipc/register（handler）。
 * 约定：*:start / *:cancel 成对；*:event 由主进程推给渲染进程。
 */
export const IPC_CHANNELS = {
  // 运行时探测
  runtimePing: "runtime:ping",

  // 设置读写（update 前主进程会 validateSettings）
  settingsGet: "settings:get",
  settingsUpdate: "settings:update",

  // Provider 连通性与模型列表
  providerHealth: "provider:health",
  providerModels: "provider:models",

  // 翻译流：start/cancel 请求，event 推进度与结果
  translationStart: "translation:start",
  translationCancel: "translation:cancel",
  translationEvent: "translation:event",

  // 句段润色
  revisionStart: "revision:start",
  revisionCancel: "revision:cancel",
  revisionEvent: "revision:event",

  // 句段备选译法
  alternativesStart: "alternatives:start",
  alternativesCancel: "alternatives:cancel",
  alternativesEvent: "alternatives:event",

  // 划词取词
  selectionCapture: "selection:capture",

  // 翻译历史
  historyList: "history:list",
  historySearch: "history:search",
  historyToggleFavorite: "history:toggle-favorite",
  historyDelete: "history:delete",
  historyClear: "history:clear",

  // 词典：本地 ECDICT 查词 + 模型语境解释
  dictionaryLookup: "dictionary:lookup",
  dictionaryStatus: "dictionary:status",
  dictionaryContextStart: "dictionary:context:start",
  dictionaryContextCancel: "dictionary:context:cancel",
  dictionaryContextEvent: "dictionary:context:event",

  // 术语表 CRUD 与 CSV 导入导出
  glossaryList: "glossary:list",
  glossaryUpsert: "glossary:upsert",
  glossaryDelete: "glossary:delete",
  glossaryConflicts: "glossary:conflicts",
  glossaryImportCsv: "glossary:import-csv",
  glossaryExportCsv: "glossary:export-csv",

  // 隐私清理与诊断导出（不含 API Key）
  privacyClearLocalData: "privacy:clear-local-data",
  diagnosticsExport: "diagnostics:export",

  // 翻译 Profile
  profileList: "profile:list",
  profileUpsert: "profile:upsert",
  profileDelete: "profile:delete",

  // 文档翻译任务
  documentList: "document:list",
  documentDelete: "document:delete",
  documentImport: "document:import",
  documentExport: "document:export",
  documentStart: "document:start",
  documentPause: "document:pause",
  documentCancel: "document:cancel",
  documentEvent: "document:event",

  // OCR 截屏取字
  ocrCapture: "ocr:capture",
  ocrListScreens: "ocr:list-screens",
  ocrCaptureRequested: "ocr:capture-requested",

  // 系统快捷键注册结果回传
  shortcutRegister: "shortcut:register",

  // 剪贴板与窗口
  clipboardWrite: "clipboard:write",
  windowOpenMain: "window:open-main",

  // 划词弹窗：payload 主→渲染，close/pin 渲染→主
  popupPayload: "popup:payload",
  popupClose: "popup:close",
  popupPin: "popup:pin"
} as const;
