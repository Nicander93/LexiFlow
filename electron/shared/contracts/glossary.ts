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
export interface GlossaryImportResult { imported: number; skipped: Array<{ row: number; reason: string }>; }
export interface GlossaryExportResult { saved: boolean; count: number; }
export interface GlossaryConflict { sourceTerm: string; targets: string[]; entryIds: string[]; }
export interface GlossaryMatchValidation { sourceTerm: string; targetTerm: string; applied: boolean; }
