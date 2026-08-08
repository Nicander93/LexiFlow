import type { HistoryRevisionUpdate, HistorySettings, TranslationHistory } from "../../../shared/types";

export interface HistoryRepository {
  list(): TranslationHistory[];
  get(id: string): TranslationHistory | undefined;
  search(query: string): TranslationHistory[];
  toggleFavorite(id: string): Promise<TranslationHistory | undefined>;
  updateRevisions(update: HistoryRevisionUpdate): Promise<TranslationHistory | undefined>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
  prune(settings: HistorySettings): Promise<void>;
}

/** Application-facing history operations used by IPC and other use cases. */
export class HistoryService {
  constructor(private readonly store: HistoryRepository) {}

  list(): TranslationHistory[] { return this.store.list(); }
  get(id: string): TranslationHistory | undefined { return this.store.get(id); }
  search(query: string): TranslationHistory[] { return this.store.search(query); }
  toggleFavorite(id: string): Promise<TranslationHistory | undefined> { return this.store.toggleFavorite(id); }
  updateRevisions(update: HistoryRevisionUpdate): Promise<TranslationHistory | undefined> { return this.store.updateRevisions(update); }
  delete(id: string): Promise<void> { return this.store.delete(id); }
  clear(): Promise<void> { return this.store.clear(); }
  prune(settings: HistorySettings): Promise<void> { return this.store.prune(settings); }
}
