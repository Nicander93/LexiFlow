import type { HistoryRevisionUpdate, HistorySettings, SegmentRevision, TranslationHistory, TranslationSegment } from "../../shared/types";

export const HISTORY_SCHEMA_VERSION = 3;

export interface StoredHistory {
  schemaVersion: number;
  items: TranslationHistory[];
}

const RETENTION_MS: Record<Exclude<HistorySettings["retention"], "forever" | "clear-on-exit">, number> = {
  "7d": 7 * 24 * 60 * 60 * 1_000,
  "30d": 30 * 24 * 60 * 60 * 1_000
};

export function normalizeHistoryItem(item: TranslationHistory): TranslationHistory {
  const originalSourceText = item.originalSourceText ?? item.sourceText;
  const originalResultText = item.originalResultText ?? item.resultText;
  return {
    ...item,
    originalSourceText,
    originalResultText,
    isFavorite: Boolean(item.isFavorite),
    kind: item.kind ?? (item.mode === "naming" ? "naming" : "translation"),
    origin: item.origin ?? "main",
    usageCount: Math.max(1, item.usageCount ?? 1),
    revisions: Array.isArray(item.revisions) ? item.revisions : [],
    segments: Array.isArray(item.segments) ? item.segments : undefined,
    updatedAt: item.updatedAt ?? item.createdAt
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function migrateRevisions(value: unknown): SegmentRevision[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SegmentRevision => {
    if (!isRecord(item)) return false;
    return typeof item.id === "string"
      && typeof item.segmentId === "string"
      && typeof item.previousTarget === "string"
      && typeof item.newTarget === "string"
      && typeof item.instruction === "string"
      && typeof item.createdAt === "number";
  });
}

function migrateSegments(value: unknown): TranslationSegment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const segments = value.filter((item): item is TranslationSegment => {
    if (!isRecord(item)) return false;
    return typeof item.id === "string"
      && typeof item.source === "string"
      && typeof item.target === "string"
      && typeof item.sourceStart === "number"
      && typeof item.sourceEnd === "number";
  });
  return segments.length ? segments : undefined;
}

function migrateHistoryItem(value: unknown): TranslationHistory | undefined {
  if (!isRecord(value)) return undefined;
  const resultText = typeof value.resultText === "string" ? value.resultText : value.targetText;
  if (
    typeof value.id !== "string" ||
    typeof value.sourceText !== "string" ||
    typeof resultText !== "string" ||
    (value.mode !== "normal" && value.mode !== "technical" && value.mode !== "naming") ||
    typeof value.targetLanguage !== "string" ||
    (value.provider !== "ollama" && value.provider !== "openai-compatible") ||
    typeof value.model !== "string" ||
    typeof value.createdAt !== "string"
  ) return undefined;

  return normalizeHistoryItem({
    id: value.id,
    sourceText: value.sourceText,
    originalSourceText: typeof value.originalSourceText === "string" ? value.originalSourceText : value.sourceText,
    resultText,
    originalResultText: typeof value.originalResultText === "string" ? value.originalResultText : resultText,
    mode: value.mode,
    profileId: typeof value.profileId === "string" ? value.profileId : undefined,
    sourceLanguage: typeof value.sourceLanguage === "string" ? value.sourceLanguage : undefined,
    targetLanguage: value.targetLanguage,
    provider: value.provider,
    model: value.model,
    promptVersion: typeof value.promptVersion === "string" ? value.promptVersion : undefined,
    createdAt: value.createdAt,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : value.createdAt,
    isFavorite: Boolean(value.isFavorite),
    kind: value.kind === "dictionary" || value.kind === "naming" || value.kind === "translation" ? value.kind : value.mode === "naming" ? "naming" : "translation",
    origin: value.origin === "popup" || value.origin === "ocr" || value.origin === "history" || value.origin === "main" ? value.origin : "main",
    usageCount: typeof value.usageCount === "number" ? Math.max(1, value.usageCount) : 1,
    revisions: migrateRevisions(value.revisions),
    segments: migrateSegments(value.segments)
  });
}

/** Converts legacy array / v1 items into Session-capable history without dropping valid entries. */
export function migrateHistory(raw: unknown): { data: StoredHistory; migrated: boolean } {
  const isCurrent = isRecord(raw) && Array.isArray(raw.items) && raw.schemaVersion === HISTORY_SCHEMA_VERSION;
  const sourceItems = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.items) ? raw.items : [];
  const items = sourceItems.map(migrateHistoryItem).filter((item): item is TranslationHistory => Boolean(item));
  const migrated = !isCurrent
    || items.length !== sourceItems.length
    || sourceItems.some((item) => isRecord(item) && (
      typeof item.resultText !== "string"
      || typeof item.isFavorite !== "boolean"
      || typeof item.originalSourceText !== "string"
      || !Array.isArray(item.revisions)
      || typeof item.kind !== "string"
      || typeof item.origin !== "string"
      || typeof item.usageCount !== "number"
    ));
  return { data: { schemaVersion: HISTORY_SCHEMA_VERSION, items }, migrated };
}

export function mergeDuplicateHistory(items: TranslationHistory[], incoming: TranslationHistory): TranslationHistory[] {
  const normalized = normalizeHistoryItem(incoming);
  const key = normalized.sourceText.trim().toLocaleLowerCase();
  const index = items.findIndex((item) => item.sourceText.trim().toLocaleLowerCase() === key && item.kind === normalized.kind && item.origin === normalized.origin);
  if (index < 0) return [normalized, ...items];
  const previous = normalizeHistoryItem(items[index]!);
  const merged = normalizeHistoryItem({ ...normalized, id: previous.id, isFavorite: previous.isFavorite, usageCount: (previous.usageCount ?? 1) + 1, createdAt: previous.createdAt, updatedAt: normalized.updatedAt ?? new Date().toISOString() });
  return [merged, ...items.slice(0, index), ...items.slice(index + 1)];
}

export function applyHistoryRetention(
  items: TranslationHistory[],
  settings: HistorySettings,
  now = Date.now()
): TranslationHistory[] {
  const limit = RETENTION_MS[settings.retention as keyof typeof RETENTION_MS];
  if (!limit) return items.map(normalizeHistoryItem);
  const threshold = now - limit;
  return items.filter((item) => Date.parse(item.createdAt) >= threshold).map(normalizeHistoryItem);
}

export function searchHistory(items: TranslationHistory[], query: string): TranslationHistory[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return structuredClone(items);
  return items.filter((item) =>
    item.sourceText.toLocaleLowerCase().includes(normalized)
    || (item.originalSourceText ?? "").toLocaleLowerCase().includes(normalized)
    || item.resultText.toLocaleLowerCase().includes(normalized)
  );
}

export function applyRevisionsToSegments(
  segments: TranslationSegment[] | undefined,
  revisions: SegmentRevision[]
): TranslationSegment[] {
  if (!segments?.length) return [];
  return segments.map((segment) => {
    const revision = [...revisions].reverse().find((item) => item.segmentId === segment.id);
    return revision ? { ...segment, target: revision.newTarget } : segment;
  });
}

export function finalTextFromSession(item: Pick<TranslationHistory, "resultText" | "segments" | "revisions">): string {
  const segments = applyRevisionsToSegments(item.segments, item.revisions ?? []);
  if (segments.length) return segments.map((segment) => segment.target).join("\n");
  return item.resultText;
}

export function mergeHistoryRevisions(item: TranslationHistory, update: HistoryRevisionUpdate): TranslationHistory {
  const revisions = update.revisions;
  return normalizeHistoryItem({
    ...item,
    revisions,
    resultText: update.resultText,
    updatedAt: new Date().toISOString()
  });
}
