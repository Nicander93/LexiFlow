import type { GlossaryConflict, GlossaryEntry, GlossaryImportResult } from "../../../shared/types";

export interface GlossaryRepository {
  list(): GlossaryEntry[];
  conflicts(): GlossaryConflict[];
  upsert(entry: GlossaryEntry): Promise<GlossaryEntry>;
  delete(id: string): Promise<void>;
  import(entries: GlossaryEntry[]): Promise<void>;
  clear(): Promise<void>;
}

export interface GlossaryCsvCodec {
  parse(content: string): { entries: GlossaryEntry[]; result: GlossaryImportResult };
  serialize(entries: GlossaryEntry[]): string;
}

export interface GlossaryFilePort {
  readCsv(): Promise<string | undefined>;
  writeCsv(content: string): Promise<boolean>;
}

/** Application-facing glossary use cases; file dialogs stay behind GlossaryFilePort. */
export class GlossaryService {
  constructor(private readonly store: GlossaryRepository, private readonly files: GlossaryFilePort, private readonly csv: GlossaryCsvCodec) {}

  list(): GlossaryEntry[] { return this.store.list(); }
  conflicts(): GlossaryConflict[] { return this.store.conflicts(); }
  upsert(entry: GlossaryEntry): Promise<GlossaryEntry> { return this.store.upsert(entry); }
  delete(id: string): Promise<void> { return this.store.delete(id); }
  clear(): Promise<void> { return this.store.clear(); }

  async importCsv(): Promise<GlossaryImportResult> {
    const content = await this.files.readCsv();
    if (content === undefined) return { imported: 0, skipped: [] };
    const parsed = this.csv.parse(content);
    await this.store.import(parsed.entries);
    return parsed.result;
  }

  async exportCsv(): Promise<{ saved: boolean; count: number }> {
    const entries = this.store.list();
    const saved = await this.files.writeCsv(this.csv.serialize(entries));
    return { saved, count: saved ? entries.length : 0 };
  }
}
