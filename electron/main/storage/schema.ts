import type { GlossaryEntry, TranslationHistory, TranslationProfile } from "../../shared/types";
import type { DocumentTasksFile } from "./documents";
import type { StoredHistory } from "./history-policy";
import type { ProfilesFile } from "./profiles";
import type { StoredSettings } from "./settings";
import type { VocabularyEntry, VocabularyFile } from "../../shared/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isProvider(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (value.type === undefined || value.type === "ollama" || value.type === "openai-compatible")
    && isOptionalString(value.baseUrl)
    && isOptionalString(value.model)
    && isOptionalNumber(value.timeoutMs)
    && isOptionalBoolean(value.stream)
    && isOptionalString(value.keepAlive)
    && isOptionalBoolean(value.remoteUsageConfirmed)
    && isOptionalBoolean(value.enableReasoning)
    && isOptionalString(value.apiKey)
    && isOptionalBoolean(value.apiKeyConfigured)
    && isOptionalString(value.encryptedApiKey);
}

function isRecordSection(value: unknown, key: string): boolean {
  return !(key in (value as Record<string, unknown>)) || isRecord((value as Record<string, unknown>)[key]);
}

/** Accepts the current settings object and older partial settings handled by mergeSettings(). */
export function isStoredSettings(value: unknown): value is StoredSettings {
  if (!isRecord(value) || !isProvider(value.provider)) return false;
  return ["shortcuts", "translation", "history", "routing", "window", "startup"]
    .every((key) => isRecordSection(value, key));
}

function isHistoryContainer(value: unknown): value is StoredHistory {
  return isRecord(value) && Array.isArray(value.items)
    && (value.schemaVersion === undefined || typeof value.schemaVersion === "number");
}

/** Legacy history was stored as an array; item-level migration validates and normalizes entries. */
export function isStoredHistory(value: unknown): value is StoredHistory | TranslationHistory[] {
  return Array.isArray(value) || isHistoryContainer(value);
}

function isProfileEntry(value: unknown): value is TranslationProfile {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.systemPrompt === "string"
    && (value.sourceLanguage === undefined || typeof value.sourceLanguage === "string")
    && (value.targetLanguage === undefined || typeof value.targetLanguage === "string")
    && isOptionalBoolean(value.isBuiltIn);
}

/** Legacy profiles were stored as an array; the wrapper form is the current format. */
export function isStoredProfiles(value: unknown): value is ProfilesFile | TranslationProfile[] {
  if (Array.isArray(value)) return value.every(isProfileEntry);
  return isRecord(value) && Array.isArray(value.profiles)
    && (value.schemaVersion === undefined || value.schemaVersion === 1)
    && value.profiles.every(isProfileEntry);
}

function isDocumentEntry(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.fileName === "string"
    && typeof value.totalChunks === "number"
    && typeof value.completedChunks === "number"
    && typeof value.status === "string"
    && typeof value.profileId === "string"
    && typeof value.model === "string"
    && typeof value.createdAt === "number"
    && typeof value.updatedAt === "number"
    && typeof value.sourcePath === "string"
    && Array.isArray(value.chunks)
    && isRecord(value.translations);
}

/** Legacy document tasks were stored as an array; the wrapper form is the current format. */
export function isStoredDocuments(value: unknown): value is DocumentTasksFile | DocumentTasksFile["tasks"] {
  if (Array.isArray(value)) return value.every(isDocumentEntry);
  return isRecord(value) && Array.isArray(value.tasks)
    && (value.schemaVersion === undefined || value.schemaVersion === 1)
    && value.tasks.every(isDocumentEntry);
}

function isGlossaryEntry(value: unknown): value is GlossaryEntry {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.sourceTerm === "string"
    && typeof value.targetTerm === "string"
    && typeof value.sourceLanguage === "string"
    && typeof value.targetLanguage === "string"
    && typeof value.caseSensitive === "boolean"
    && (value.matchMode === "exact" || value.matchMode === "word" || value.matchMode === "phrase")
    && typeof value.enabled === "boolean"
    && typeof value.createdAt === "number"
    && typeof value.updatedAt === "number";
}

export function isStoredGlossary(value: unknown): value is GlossaryEntry[] {
  return Array.isArray(value) && value.every(isGlossaryEntry);
}

function isVocabularyEntry(value: unknown): value is VocabularyEntry {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.term === "string"
    && typeof value.translation === "string"
    && typeof value.sourceLanguage === "string"
    && typeof value.targetLanguage === "string"
    && (value.status === "learning" || value.status === "mastered")
    && typeof value.createdAt === "number"
    && typeof value.updatedAt === "number"
    && isOptionalString(value.phonetic)
    && isOptionalString(value.context)
    && isOptionalString(value.note);
}

export function isStoredVocabulary(value: unknown): value is VocabularyFile {
  return isRecord(value) && value.schemaVersion === 1
    && Array.isArray(value.entries) && value.entries.every(isVocabularyEntry);
}
