import type { HistorySettings, TranslationHistory } from "../../shared/types";

export const HISTORY_SCHEMA_VERSION = 1;

export interface StoredHistory {
  schemaVersion: number;
  items: TranslationHistory[];
}

const RETENTION_MS: Record<Exclude<HistorySettings["retention"], "forever" | "clear-on-exit">, number> = {
  "7d": 7 * 24 * 60 * 60 * 1_000,
  "30d": 30 * 24 * 60 * 60 * 1_000
};

export function normalizeHistoryItem(item: TranslationHistory): TranslationHistory {
  return { ...item, isFavorite: Boolean(item.isFavorite) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
    resultText,
    mode: value.mode,
    sourceLanguage: typeof value.sourceLanguage === "string" ? value.sourceLanguage : undefined,
    targetLanguage: value.targetLanguage,
    provider: value.provider,
    model: value.model,
    createdAt: value.createdAt,
    isFavorite: Boolean(value.isFavorite)
  });
}

/** Converts the pre-V2 array format and legacy `targetText` field without losing valid entries. */
export function migrateHistory(raw: unknown): { data: StoredHistory; migrated: boolean } {
  const isVersioned = isRecord(raw) && Array.isArray(raw.items) && raw.schemaVersion === HISTORY_SCHEMA_VERSION;
  const sourceItems = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.items) ? raw.items : [];
  const items = sourceItems.map(migrateHistoryItem).filter((item): item is TranslationHistory => Boolean(item));
  const migrated = !isVersioned || items.length !== sourceItems.length || sourceItems.some((item) => isRecord(item) && (typeof item.resultText !== "string" || typeof item.isFavorite !== "boolean"));
  return { data: { schemaVersion: HISTORY_SCHEMA_VERSION, items }, migrated };
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
    item.sourceText.toLocaleLowerCase().includes(normalized) || item.resultText.toLocaleLowerCase().includes(normalized)
  );
}
