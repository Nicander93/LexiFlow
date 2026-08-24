export type VocabularyStatus = "learning" | "mastered";

export interface VocabularyEntry {
  id: string;
  term: string;
  translation: string;
  phonetic?: string;
  sourceLanguage: string;
  targetLanguage: string;
  context?: string;
  note?: string;
  status: VocabularyStatus;
  createdAt: number;
  updatedAt: number;
}

export interface VocabularyUpsertInput {
  id?: string;
  term: string;
  translation: string;
  phonetic?: string;
  sourceLanguage: string;
  targetLanguage: string;
  context?: string;
  note?: string;
  status?: VocabularyStatus;
  createdAt?: number;
}

export interface VocabularyFile {
  schemaVersion: 1;
  entries: VocabularyEntry[];
}
