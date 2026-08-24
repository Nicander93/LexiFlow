import { randomUUID } from "node:crypto";
import { app } from "electron";
import { join } from "node:path";
import type { VocabularyEntry, VocabularyFile, VocabularyUpsertInput } from "../../shared/types";
import { JsonStore } from "./json-store";
import { isStoredVocabulary } from "./schema";

const EMPTY_VOCABULARY: VocabularyFile = { schemaVersion: 1, entries: [] };

function duplicateKey(entry: Pick<VocabularyEntry, "term" | "sourceLanguage" | "targetLanguage">): string {
  return `${entry.sourceLanguage}\u0000${entry.targetLanguage}\u0000${entry.term.trim().toLocaleLowerCase()}`;
}

export class VocabularyStore {
  private store!: JsonStore<VocabularyFile>;
  private file: VocabularyFile = structuredClone(EMPTY_VOCABULARY);

  async initialize(): Promise<void> {
    this.store = new JsonStore(join(app.getPath("userData"), "vocabulary.json"), EMPTY_VOCABULARY, {
      backup: true,
      validate: isStoredVocabulary
    });
    this.file = await this.store.read();
  }

  list(): VocabularyEntry[] {
    return structuredClone(this.file.entries).sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async upsert(input: VocabularyUpsertInput): Promise<VocabularyEntry> {
    const now = Date.now();
    const term = input.term.trim();
    const translation = input.translation.trim();
    if (!term || !translation) throw new Error("生词和释义不能为空。");
    const existingIndex = input.id
      ? this.file.entries.findIndex((entry) => entry.id === input.id)
      : this.file.entries.findIndex((entry) => duplicateKey(entry) === duplicateKey({ ...input, term }));
    const existing = existingIndex >= 0 ? this.file.entries[existingIndex] : undefined;
    const value: VocabularyEntry = {
      id: existing?.id ?? input.id ?? randomUUID(),
      term,
      translation,
      phonetic: input.phonetic?.trim() || undefined,
      sourceLanguage: input.sourceLanguage.trim() || "auto",
      targetLanguage: input.targetLanguage.trim() || "auto",
      context: input.context?.trim() || undefined,
      note: input.note?.trim() || undefined,
      status: input.status ?? existing?.status ?? "learning",
      createdAt: existing?.createdAt ?? input.createdAt ?? now,
      updatedAt: now
    };
    if (existingIndex >= 0) this.file.entries[existingIndex] = value;
    else this.file.entries.unshift(value);
    await this.store.write(this.file);
    return structuredClone(value);
  }

  async delete(id: string): Promise<void> {
    this.file.entries = this.file.entries.filter((entry) => entry.id !== id);
    await this.store.write(this.file);
  }

  async clear(): Promise<void> {
    this.file = structuredClone(EMPTY_VOCABULARY);
    await this.store.write(this.file);
  }
}
