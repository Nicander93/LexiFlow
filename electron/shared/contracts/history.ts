import type { ProviderType } from "./settings";
import type { SegmentRevision, TranslationMode, TranslationSegment } from "./translation";

export interface TranslationHistory {
  id: string;
  sourceText: string;
  originalSourceText?: string;
  resultText: string;
  originalResultText?: string;
  mode: TranslationMode;
  profileId?: string;
  sourceLanguage?: string;
  targetLanguage: string;
  provider: ProviderType;
  model: string;
  promptVersion?: string;
  createdAt: string;
  updatedAt?: string;
  isFavorite: boolean;
  revisions?: SegmentRevision[];
  segments?: TranslationSegment[];
}
export interface HistoryRevisionUpdate { id: string; revisions: SegmentRevision[]; resultText: string; }
