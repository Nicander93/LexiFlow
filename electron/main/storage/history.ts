import { app } from "electron";
import { join } from "node:path";
import type { HistorySettings, TranslationHistory } from "../../shared/types";
import { JsonStore } from "./json-store";
import { applyHistoryRetention, HISTORY_SCHEMA_VERSION, migrateHistory, normalizeHistoryItem, searchHistory, type StoredHistory } from "./history-policy";

export class HistoryStore {
  private store!: JsonStore<StoredHistory>;
  private items: TranslationHistory[] = [];

  async initialize(): Promise<void> {
    this.store = new JsonStore(join(app.getPath("userData"), "history.json"), { schemaVersion: HISTORY_SCHEMA_VERSION, items: [] });
    const migration = migrateHistory(await this.store.read());
    this.items = migration.data.items;
    if (migration.migrated) {
      try {
        await this.persist();
      } catch {
        // A read-only or failing history file must not prevent translation from starting.
      }
    }
  }

  private persist(): Promise<void> {
    return this.store.write({ schemaVersion: HISTORY_SCHEMA_VERSION, items: this.items });
  }

  list(): TranslationHistory[] {
    return structuredClone(this.items);
  }

  search(query: string): TranslationHistory[] {
    return structuredClone(searchHistory(this.items, query));
  }

  async prune(settings: HistorySettings): Promise<void> {
    const retained = applyHistoryRetention(this.items, settings);
    if (retained.length === this.items.length && retained.every((item, index) => item.isFavorite === this.items[index]?.isFavorite)) return;
    this.items = retained;
    await this.persist();
  }

  async add(item: TranslationHistory, settings: HistorySettings): Promise<void> {
    if (!settings.enabled) return;
    this.items = applyHistoryRetention([normalizeHistoryItem(item), ...this.items], settings).slice(0, settings.maxItems);
    await this.persist();
  }

  async toggleFavorite(id: string): Promise<TranslationHistory | undefined> {
    const item = this.items.find((candidate) => candidate.id === id);
    if (!item) return undefined;
    item.isFavorite = !item.isFavorite;
    await this.persist();
    return structuredClone(item);
  }

  async delete(id: string): Promise<void> {
    this.items = this.items.filter((item) => item.id !== id);
    await this.persist();
  }

  async clear(): Promise<void> {
    this.items = [];
    await this.persist();
  }
}
