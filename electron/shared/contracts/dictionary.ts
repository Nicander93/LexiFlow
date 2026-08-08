import type { TargetLanguage } from "./translation";

export type DictionaryMatchType = "exact" | "normalized" | "lemma" | "fuzzy" | "none";
export interface DictionarySense { partOfSpeech?: string; translations: string[]; definitions?: string[]; }
export interface DictionaryForm { code: string; label: string; value: string; }
export interface DictionaryLabels { exams: string[]; collinsStars?: number; oxford3000: boolean; bncRank?: number; contemporaryRank?: number; }
export interface DictionaryEntry { headword: string; phonetic?: string; senses: DictionarySense[]; forms: DictionaryForm[]; labels: DictionaryLabels; }
export interface DictionaryLookupRequest { query: string; }
export interface DictionaryLookupResult { query: string; normalizedQuery: string; found: boolean; matchType: DictionaryMatchType; entry?: DictionaryEntry; suggestions: string[]; unavailableReason?: string; }
export interface DictionaryStatus { available: boolean; source: "ECDICT"; dictionaryVersion?: string; schemaVersion?: number; entryCount?: number; message?: string; }
export interface DictionaryContextRequest { term: string; source: string; target: string; targetLanguage: TargetLanguage; profileId?: string; profilePrompt?: string; }
export interface DictionaryContextEvent { requestId: string; status: import("./translation").TranslationStatus; explanation?: string; error?: string; }
