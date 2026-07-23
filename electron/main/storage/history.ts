import { app } from "electron";
import { join } from "node:path";
import type { HistorySettings, TranslationHistory } from "../../shared/types";
import { JsonStore } from "./json-store";

export class HistoryStore {
  private store!: JsonStore<TranslationHistory[]>;
  private items: TranslationHistory[] = [];

  async initialize(): Promise<void> {
    this.store = new JsonStore(join(app.getPath("userData"), "history.json"), []);
    this.items = await this.store.read();
  }

  list(): TranslationHistory[] {
    return structuredClone(this.items);
  }

  async add(item: TranslationHistory, settings: HistorySettings): Promise<void> {
    if (!settings.enabled) return;
    this.items = [item, ...this.items].slice(0, settings.maxItems);
    await this.store.write(this.items);
  }

  async delete(id: string): Promise<void> {
    this.items = this.items.filter((item) => item.id !== id);
    await this.store.write(this.items);
  }

  async clear(): Promise<void> {
    this.items = [];
    await this.store.write(this.items);
  }
}
