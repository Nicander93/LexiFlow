import { DatabaseSync } from "node:sqlite";
import type { DictionaryStatus } from "../../shared/types";
import type { RawDictionaryRow } from "./parse-entry";

export interface DictionaryRepository {
  initialize(): void;
  getStatus(): DictionaryStatus;
  findExact(query: string): RawDictionaryRow | null;
  findLemma(form: string): RawDictionaryRow | null;
  findByStripKey(sw: string, limit?: number): RawDictionaryRow[];
  close(): void;
}

interface MetadataRow {
  key: string;
  value: string;
}

const ENTRY_SELECT = `
  SELECT word, phonetic, definition, translation, pos, collins, oxford, tag, bnc, frq, exchange
  FROM entries
`;

export class EcdictRepository implements DictionaryRepository {
  private db: DatabaseSync | null = null;
  private status: DictionaryStatus = {
    available: false,
    source: "ECDICT",
    message: "本地词典尚未初始化。"
  };
  private findExactStmt: ReturnType<DatabaseSync["prepare"]> | null = null;
  private findLemmaStmt: ReturnType<DatabaseSync["prepare"]> | null = null;
  private findSwStmt: ReturnType<DatabaseSync["prepare"]> | null = null;

  constructor(private readonly databasePath: string) {}

  initialize(): void {
    try {
      const db = new DatabaseSync(this.databasePath, {
        readOnly: true,
        timeout: 1000
      });
      db.exec("PRAGMA query_only = ON;");

      const metaRows = db.prepare("SELECT key, value FROM metadata").all() as unknown as MetadataRow[];
      const meta = Object.fromEntries(metaRows.map((row) => [row.key, row.value]));
      const schemaVersion = Number(meta.schema_version ?? 0);
      const entryCount = Number(meta.entry_count ?? 0);
      if (schemaVersion !== 1 || !Number.isFinite(entryCount) || entryCount <= 0) {
        db.close();
        this.status = {
          available: false,
          source: "ECDICT",
          message: "本地词典资源不可用，仍可使用 AI 翻译。"
        };
        return;
      }

      this.findExactStmt = db.prepare(`${ENTRY_SELECT} WHERE word = ? COLLATE NOCASE LIMIT 1`);
      this.findLemmaStmt = db.prepare(`
        ${ENTRY_SELECT}
        WHERE word = (
          SELECT lemma FROM forms WHERE form = ? COLLATE NOCASE LIMIT 1
        ) COLLATE NOCASE
        LIMIT 1
      `);
      this.findSwStmt = db.prepare(`${ENTRY_SELECT} WHERE sw = ? ORDER BY word COLLATE NOCASE LIMIT ?`);

      const probe = this.findExactStmt.get("sorry") as RawDictionaryRow | undefined;
      if (!probe && entryCount > 0) {
        // Probe may miss on tiny fixtures without "sorry"; still accept a readable DB.
        db.prepare("SELECT 1 FROM entries LIMIT 1").get();
      }

      this.db = db;
      this.status = {
        available: true,
        source: "ECDICT",
        dictionaryVersion: meta.dictionary_version,
        schemaVersion,
        entryCount,
        message: undefined
      };
    } catch {
      this.close();
      this.status = {
        available: false,
        source: "ECDICT",
        message: "本地词典资源不可用，仍可使用 AI 翻译。"
      };
    }
  }

  getStatus(): DictionaryStatus {
    return { ...this.status };
  }

  findExact(query: string): RawDictionaryRow | null {
    if (!this.findExactStmt) return null;
    const row = this.findExactStmt.get(query) as unknown as RawDictionaryRow | undefined;
    return row ?? null;
  }

  findLemma(form: string): RawDictionaryRow | null {
    if (!this.findLemmaStmt) return null;
    const row = this.findLemmaStmt.get(form) as unknown as RawDictionaryRow | undefined;
    return row ?? null;
  }

  findByStripKey(sw: string, limit = 5): RawDictionaryRow[] {
    if (!this.findSwStmt || !sw) return [];
    return this.findSwStmt.all(sw, limit) as unknown as RawDictionaryRow[];
  }

  close(): void {
    try {
      this.db?.close();
    } catch {
      // ignore close errors on shutdown
    }
    this.db = null;
    this.findExactStmt = null;
    this.findLemmaStmt = null;
    this.findSwStmt = null;
  }
}
