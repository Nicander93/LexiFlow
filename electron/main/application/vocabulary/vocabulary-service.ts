import type { VocabularyEntry, VocabularyUpsertInput } from "../../../shared/types";

export interface VocabularyRepository {
  list(): VocabularyEntry[];
  upsert(entry: VocabularyUpsertInput): Promise<VocabularyEntry>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

export class VocabularyService {
  constructor(private readonly store: VocabularyRepository) {}
  list(): VocabularyEntry[] { return this.store.list(); }
  upsert(entry: VocabularyUpsertInput): Promise<VocabularyEntry> { return this.store.upsert(entry); }
  delete(id: string): Promise<void> { return this.store.delete(id); }
  clear(): Promise<void> { return this.store.clear(); }
}
