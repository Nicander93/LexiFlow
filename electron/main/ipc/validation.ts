import type {
  DocumentExportRequest,
  DocumentImportRequest,
  DictionaryContextRequest,
  DictionaryLookupRequest,
  GlossaryEntry,
  HistoryRevisionUpdate,
  RecognizeRegionRequest,
  SegmentAlternativeRequest,
  SegmentRevisionRequest,
  SettingsPatch,
  TranslationRequest,
  TranslationProfile
} from "../../shared/types";

export class IpcValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IpcValidationError";
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new IpcValidationError(`${label}必须是对象。`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, maxLength = 100_000): string {
  if (typeof value !== "string" || !value.trim()) throw new IpcValidationError(label === "原文" ? "请输入文本，或先在其他应用中选中文字。" : `${label}不能为空。`);
  if (value.length > maxLength) throw new IpcValidationError(`${label}过长。`);
  return value;
}

export function parseId(value: unknown, label = "ID"): string {
  return text(value, label, 256);
}

export function parseTranslationRequest(value: unknown): TranslationRequest {
  const input = record(value, "翻译请求");
  const mode = input.mode;
  if (mode !== "normal" && mode !== "technical" && mode !== "naming") throw new IpcValidationError("翻译模式无效。");
  const targetLanguage = input.targetLanguage;
  if (targetLanguage !== "auto" && targetLanguage !== "zh-CN" && targetLanguage !== "en") throw new IpcValidationError("目标语言无效。");
  const request: TranslationRequest = {
    text: text(input.text, "原文"),
    targetLanguage,
    mode
  };
  if (input.sourceLanguage !== undefined) request.sourceLanguage = text(input.sourceLanguage, "源语言", 32);
  if (input.context !== undefined) request.context = text(input.context, "上下文", 20_000);
  if (input.profileId !== undefined) request.profileId = parseId(input.profileId, "Profile ID");
  if (input.profilePrompt !== undefined) request.profilePrompt = text(input.profilePrompt, "提示词", 50_000);
  if (input.surface !== undefined) {
    if (input.surface !== "main" && input.surface !== "popup" && input.surface !== "ocr" && input.surface !== "history") throw new IpcValidationError("翻译来源无效。");
    request.surface = input.surface;
  }
  return request;
}

function parseSegmentRequest(value: unknown, label: string): Record<string, unknown> {
  const input = record(value, label);
  const segment = record(input.segment, "句段");
  parseId(segment.id, "句段 ID");
  text(segment.source, "句段原文", 100_000);
  if (typeof segment.target !== "string" || segment.target.length > 100_000) throw new IpcValidationError("句段译文无效。");
  if (!Number.isInteger(segment.sourceStart) || !Number.isInteger(segment.sourceEnd) || Number(segment.sourceEnd) < Number(segment.sourceStart)) throw new IpcValidationError("句段范围无效。");
  return input;
}

export function parseSegmentRevisionRequest(value: unknown): SegmentRevisionRequest {
  const input = parseSegmentRequest(value, "句段修订请求");
  text(input.instruction, "修订要求", 4_000);
  const targetLanguage = input.targetLanguage;
  if (targetLanguage !== "auto" && targetLanguage !== "zh-CN" && targetLanguage !== "en") throw new IpcValidationError("目标语言无效。");
  return value as SegmentRevisionRequest;
}

export function parseSegmentAlternativeRequest(value: unknown): SegmentAlternativeRequest {
  const input = parseSegmentRequest(value, "候选译法请求");
  const targetLanguage = input.targetLanguage;
  if (targetLanguage !== "auto" && targetLanguage !== "zh-CN" && targetLanguage !== "en") throw new IpcValidationError("目标语言无效。");
  return value as SegmentAlternativeRequest;
}

export function parseDictionaryLookupRequest(value: unknown): DictionaryLookupRequest {
  const input = record(value, "词典查询请求");
  return { query: text(input.query, "查询", 256) };
}

export function parseDictionaryContextRequest(value: unknown): DictionaryContextRequest {
  const input = record(value, "词典上下文请求");
  const targetLanguage = input.targetLanguage;
  if (targetLanguage !== "auto" && targetLanguage !== "zh-CN" && targetLanguage !== "en") throw new IpcValidationError("目标语言无效。");
  return {
    term: text(input.term, "词条", 256),
    source: text(input.source, "原文", 20_000),
    target: text(input.target, "译文", 20_000),
    targetLanguage,
    profileId: input.profileId === undefined ? undefined : parseId(input.profileId, "Profile ID")
  } as DictionaryContextRequest;
}

export function parseSettingsPatch(value: unknown): SettingsPatch {
  const input = record(value, "设置命令");
  if (input.type === "reset") return { type: "reset" };
  const patchTypes = new Set(["update-general", "update-shortcuts", "update-provider", "update-window"]);
  if (typeof input.type !== "string" || !patchTypes.has(input.type)) throw new IpcValidationError("设置命令类型无效。");
  const patch = record(input.value, "设置补丁");
  if (input.type === "update-provider") {
    if (patch.baseUrl !== undefined) text(patch.baseUrl, "模型服务地址", 2_000);
    if (patch.model !== undefined) text(patch.model, "模型名称", 256);
    if (patch.type !== undefined && patch.type !== "ollama" && patch.type !== "openai-compatible") throw new IpcValidationError("Provider 类型无效。");
    if (patch.timeoutMs !== undefined && (!Number.isInteger(patch.timeoutMs) || Number(patch.timeoutMs) < 1_000 || Number(patch.timeoutMs) > 600_000)) throw new IpcValidationError("请求超时时间无效。");
    for (const key of ["remoteUsageConfirmed", "enableReasoning", "stream"]) if (patch[key] !== undefined) parseBoolean(patch[key], key);
    if (patch.apiKey !== undefined) parseString(patch.apiKey, "API Key", 10_000);
  } else if (input.type === "update-shortcuts") {
    for (const key of ["translation", "naming", "screenshot", "defaultTranslationProfileId"]) if (patch[key] !== undefined) text(patch[key], key, 256);
    if (patch.paused !== undefined) parseBoolean(patch.paused, "暂停状态");
    if (patch.enableSelectionTranslation !== undefined) parseBoolean(patch.enableSelectionTranslation, "划词翻译状态");
  } else if (input.type === "update-window") {
    if (patch.closeAction !== undefined && patch.closeAction !== "hide" && patch.closeAction !== "quit") throw new IpcValidationError("窗口关闭行为无效。");
    if (patch.autoHidePopup !== undefined) parseBoolean(patch.autoHidePopup, "弹窗自动隐藏状态");
    if (patch.popupBounds !== undefined) {
      const bounds = record(patch.popupBounds, "弹窗尺寸");
      if (!Number.isInteger(bounds.width) || !Number.isInteger(bounds.height) || Number(bounds.width) < 360 || Number(bounds.height) < 220 || Number(bounds.width) > 2_000 || Number(bounds.height) > 4_000) throw new IpcValidationError("弹窗尺寸无效。");
    }
  } else {
    if (patch.translation !== undefined) parseTranslationSettingsPatch(patch.translation);
    if (patch.history !== undefined) parseHistorySettingsPatch(patch.history);
    if (patch.routing !== undefined) parseRoutingSettingsPatch(patch.routing);
    if (patch.startup !== undefined) {
      const startup = record(patch.startup, "设置.startup");
      if (startup.enabled !== undefined) parseBoolean(startup.enabled, "开机启动状态");
    }
  }
  return value as SettingsPatch;
}

function parseTranslationSettingsPatch(value: unknown): void {
  const patch = record(value, "设置.translation");
  const targetLanguage = patch.targetLanguage;
  if (targetLanguage !== undefined && targetLanguage !== "auto" && targetLanguage !== "zh-CN" && targetLanguage !== "en") throw new IpcValidationError("目标语言无效。");
  if (patch.maxInputLength !== undefined) parseInteger(patch.maxInputLength, "最大输入长度", 100, 100_000);
  for (const key of ["autoCleanText", "preserveOriginalLineBreaks", "protectCodeBlocks"]) if (patch[key] !== undefined) parseBoolean(patch[key], key);
  for (const key of ["normalPrompt", "technicalPrompt", "namingPrompt"]) if (patch[key] !== undefined) parseString(patch[key], key, 50_000);
}

function parseHistorySettingsPatch(value: unknown): void {
  const patch = record(value, "设置.history");
  if (patch.enabled !== undefined) parseBoolean(patch.enabled, "历史记录状态");
  if (patch.maxItems !== undefined) parseInteger(patch.maxItems, "历史记录数量", 1, 100_000);
  if (patch.retention !== undefined && patch.retention !== "7d" && patch.retention !== "30d" && patch.retention !== "forever" && patch.retention !== "clear-on-exit") throw new IpcValidationError("历史记录保留周期无效。");
}

function parseRoutingSettingsPatch(value: unknown): void {
  const patch = record(value, "设置.routing");
  if (patch.enabled !== undefined) parseBoolean(patch.enabled, "模型路由状态");
  if (patch.shortTextMaxLength !== undefined) parseInteger(patch.shortTextMaxLength, "短文本路由阈值", 1, 100_000);
  if (patch.shortTextModel !== undefined) parseString(patch.shortTextModel, "短文本模型", 256);
  if (patch.documentModel !== undefined) parseString(patch.documentModel, "文档模型", 256);
}

export function parseOcrRegion(value: unknown): RecognizeRegionRequest {
  const input = record(value, "OCR 识别请求");
  const captureId = parseId(input.captureId, "截图 ID");
  const region = record(input.region, "选区");
  const values = [region.x, region.y, region.width, region.height];
  if (values.some((item) => typeof item !== "number" || !Number.isFinite(item))) throw new IpcValidationError("选区坐标无效。");
  if (Number(region.x) < 0 || Number(region.y) < 0 || Number(region.x) > 1 || Number(region.y) > 1 || Number(region.width) > 1 || Number(region.height) > 1) throw new IpcValidationError("选区坐标必须是 0 到 1 之间的归一化值。");
  if (Number(region.width) <= 0 || Number(region.height) <= 0) throw new IpcValidationError("选区不能为空。");
  return value as RecognizeRegionRequest;
}

export function parseRoute(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > 256 || !value.startsWith("/")) throw new IpcValidationError("导航路径无效。");
  return value;
}

export function parseDocumentImportRequest(value: unknown): DocumentImportRequest {
  const input = record(value, "文档导入请求");
  return { profileId: parseId(input.profileId, "Profile ID") };
}

export function parseDocumentExportRequest(value: unknown): DocumentExportRequest {
  const input = record(value, "文档导出请求");
  const format = input.format;
  if (format !== "translated" && format !== "bilingual" && format !== "json") throw new IpcValidationError("文档导出格式无效。");
  return { taskId: parseId(input.taskId, "任务 ID"), format };
}

export function parseHistoryRevisionUpdate(value: unknown): HistoryRevisionUpdate {
  const input = record(value, "历史修订请求");
  const revisions = input.revisions;
  if (!Array.isArray(revisions) || revisions.length > 500) throw new IpcValidationError("历史修订列表无效。");
  const parsed = revisions.map((item) => {
    const revision = record(item, "历史修订");
    if (!Number.isFinite(revision.createdAt)) throw new IpcValidationError("历史修订时间无效。");
    return {
      id: parseId(revision.id, "修订 ID"),
      segmentId: parseId(revision.segmentId, "句段 ID"),
      previousTarget: parseString(revision.previousTarget, "旧译文", 100_000),
      newTarget: parseString(revision.newTarget, "新译文", 100_000),
      instruction: parseString(revision.instruction, "修订要求", 4_000),
      createdAt: Number(revision.createdAt)
    };
  });
  return {
    id: parseId(input.id, "历史 ID"),
    revisions: parsed,
    resultText: parseString(input.resultText, "译文", 100_000)
  };
}

export function parseGlossaryEntry(value: unknown): GlossaryEntry {
  const input = record(value, "术语条目");
  const matchMode = input.matchMode;
  if (matchMode !== "exact" && matchMode !== "word" && matchMode !== "phrase") throw new IpcValidationError("术语匹配模式无效。");
  return {
    id: parseId(input.id, "术语 ID"),
    sourceTerm: text(input.sourceTerm, "源术语", 1_000),
    targetTerm: text(input.targetTerm, "目标术语", 1_000),
    sourceLanguage: text(input.sourceLanguage, "源语言", 32),
    targetLanguage: text(input.targetLanguage, "目标语言", 32),
    domain: input.domain === undefined ? undefined : parseString(input.domain, "术语领域", 256),
    caseSensitive: parseBoolean(input.caseSensitive, "大小写敏感状态"),
    matchMode,
    note: input.note === undefined ? undefined : parseString(input.note, "术语备注", 4_000),
    enabled: parseBoolean(input.enabled, "术语启用状态"),
    createdAt: parseTimestamp(input.createdAt, "创建时间"),
    updatedAt: parseTimestamp(input.updatedAt, "更新时间")
  };
}

export function parseTranslationProfile(value: unknown): TranslationProfile {
  const input = record(value, "Profile");
  const targetLanguage = input.targetLanguage;
  if (targetLanguage !== "auto" && targetLanguage !== "zh-CN" && targetLanguage !== "en") throw new IpcValidationError("Profile 目标语言无效。");
  const sourceLanguage = input.sourceLanguage;
  if (typeof sourceLanguage !== "string" || (sourceLanguage !== "auto" && sourceLanguage.length > 32)) throw new IpcValidationError("Profile 源语言无效。");
  const dictionaryMode = input.dictionaryMode;
  if (dictionaryMode !== "off" && dictionaryMode !== "basic" && dictionaryMode !== "contextual") throw new IpcValidationError("Profile 词典模式无效。");
  if (input.temperature !== undefined && (typeof input.temperature !== "number" || !Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 2)) throw new IpcValidationError("Profile 温度无效。");
  return {
    id: parseId(input.id, "Profile ID"),
    name: text(input.name, "Profile 名称", 256),
    description: input.description === undefined ? undefined : parseString(input.description, "Profile 描述", 4_000),
    systemPrompt: text(input.systemPrompt, "Profile 提示词", 50_000),
    sourceLanguage,
    targetLanguage,
    temperature: input.temperature as number | undefined,
    preserveMarkdown: parseBoolean(input.preserveMarkdown, "Markdown 保留状态"),
    preserveCode: parseBoolean(input.preserveCode, "代码保留状态"),
    enableGlossary: parseBoolean(input.enableGlossary, "术语启用状态"),
    dictionaryMode,
    modelId: input.modelId === undefined ? undefined : parseString(input.modelId, "Profile 模型", 256),
    allowRemote: input.allowRemote === undefined ? undefined : parseBoolean(input.allowRemote, "远程模型状态"),
    isBuiltIn: parseBoolean(input.isBuiltIn, "内置 Profile 状态")
  };
}

function parseTimestamp(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new IpcValidationError(`${label}无效。`);
  return value;
}

export function parseBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new IpcValidationError(`${label}必须是布尔值。`);
  return value;
}

export function parseString(value: unknown, label: string, maxLength = 100_000): string {
  if (typeof value !== "string" || value.length > maxLength) throw new IpcValidationError(`${label}无效。`);
  return value;
}

function parseInteger(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new IpcValidationError(`${label}无效。`);
  return value;
}
