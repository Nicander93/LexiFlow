/**
 * 术语表本地存储：按源/目标语言筛选命中；exact > word > 其他，同级比 updatedAt。
 * CSV 导入冲突由 conflicts() 暴露，不静默覆盖。
 */
import { randomUUID } from "node:crypto";
import { app } from "electron";
import { join } from "node:path";
import type { GlossaryConflict, GlossaryEntry, GlossaryImportResult } from "../../shared/types";
import { JsonStore } from "./json-store";

const CSV_HEADERS = ["sourceTerm", "targetTerm", "sourceLanguage", "targetLanguage", "domain", "caseSensitive", "matchMode", "note", "enabled"] as const;

function normalizeTermKey(entry: GlossaryEntry): string {
  return `${entry.sourceLanguage}\u0000${entry.targetLanguage}\u0000${entry.sourceTerm.toLocaleLowerCase()}`;
}

function matchPriority(entry: GlossaryEntry): number {
  const matchMode = entry.matchMode === "exact" ? 3 : entry.matchMode === "word" ? 2 : 1;
  return matchMode * 1_000_000_000_000 + (entry.caseSensitive ? 100_000_000_000 : 0) + entry.updatedAt;
}

function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"') { quoted = true; continue; }
    if (character === ",") { row.push(field); field = ""; continue; }
    if (character === "\n" || character === "\r") {
      if (character === "\r" && content[index + 1] === "\n") index += 1;
      row.push(field); rows.push(row); row = []; field = "";
      continue;
    }
    field += character;
  }
  if (quoted) throw new Error("CSV 中存在未闭合的引号。 ");
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function parseBoolean(value: string, fallback: boolean): boolean | undefined {
  const normalized = value.trim().toLocaleLowerCase();
  if (!normalized) return fallback;
  if (["true", "1", "yes", "y", "是"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "否"].includes(normalized)) return false;
  return undefined;
}

export function parseGlossaryCsv(content: string, now = Date.now()): { entries: GlossaryEntry[]; result: GlossaryImportResult } {
  const rows = parseCsvRows(content.replace(/^\uFEFF/, ""));
  const header = rows.shift()?.map((value) => value.trim());
  if (!header || !header.includes("sourceTerm") || !header.includes("targetTerm")) throw new Error("CSV 必须包含 sourceTerm 和 targetTerm 列。 ");
  const column = (name: string) => header.indexOf(name);
  const read = (row: string[], name: string) => {
    const index = column(name);
    return index >= 0 ? (row[index] ?? "").trim() : "";
  };
  const entries: GlossaryEntry[] = [];
  const skipped: GlossaryImportResult["skipped"] = [];
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    if (!row.some((value) => value.trim())) return;
    const sourceTerm = read(row, "sourceTerm");
    const targetTerm = read(row, "targetTerm");
    const caseSensitive = parseBoolean(read(row, "caseSensitive"), false);
    const enabled = parseBoolean(read(row, "enabled"), true);
    const matchMode = read(row, "matchMode") || "phrase";
    if (!sourceTerm || !targetTerm) { skipped.push({ row: rowNumber, reason: "原术语和译文不能为空。" }); return; }
    if (caseSensitive === undefined || enabled === undefined) { skipped.push({ row: rowNumber, reason: "布尔字段必须是 true/false、1/0 或 是/否。" }); return; }
    if (matchMode !== "exact" && matchMode !== "word" && matchMode !== "phrase") { skipped.push({ row: rowNumber, reason: "matchMode 必须是 exact、word 或 phrase。" }); return; }
    entries.push({
      id: randomUUID(), sourceTerm, targetTerm,
      sourceLanguage: read(row, "sourceLanguage") || "auto",
      targetLanguage: read(row, "targetLanguage") || "auto",
      domain: read(row, "domain") || undefined,
      caseSensitive, matchMode,
      note: read(row, "note") || undefined,
      enabled, createdAt: now, updatedAt: now
    });
  });
  return { entries, result: { imported: entries.length, skipped } };
}

function escapeCsv(value: string | undefined): string {
  const text = value ?? "";
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportGlossaryCsv(entries: GlossaryEntry[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const entry of entries) lines.push([
    entry.sourceTerm, entry.targetTerm, entry.sourceLanguage, entry.targetLanguage, entry.domain,
    String(entry.caseSensitive), entry.matchMode, entry.note, String(entry.enabled)
  ].map(escapeCsv).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

export function findGlossaryConflicts(entries: GlossaryEntry[]): GlossaryConflict[] {
  const groups = new Map<string, GlossaryEntry[]>();
  for (const entry of entries) {
    const key = normalizeTermKey(entry);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.values()]
    .filter((group) => new Set(group.map((entry) => entry.targetTerm)).size > 1)
    .map((group) => ({ sourceTerm: group[0].sourceTerm, targets: [...new Set(group.map((entry) => entry.targetTerm))], entryIds: group.map((entry) => entry.id) }));
}

export function findGlossaryMatches(text: string, entries: GlossaryEntry[], sourceLanguage?: string, targetLanguage?: string): Record<string, string> {
  const matches: Record<string, string> = {};
  const selected = new Map<string, GlossaryEntry>();
  for (const entry of entries) {
    if (!entry.enabled || !entry.sourceTerm.trim()) continue;
    if (sourceLanguage && entry.sourceLanguage !== "auto" && entry.sourceLanguage !== sourceLanguage) continue;
    if (targetLanguage && entry.targetLanguage !== "auto" && entry.targetLanguage !== targetLanguage) continue;
    const flags = entry.caseSensitive ? "" : "i";
    const escaped = entry.sourceTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = entry.matchMode === "word" ? `\\b${escaped}\\b` : escaped;
    if (!new RegExp(pattern, flags).test(text)) continue;
    const key = normalizeTermKey(entry);
    const current = selected.get(key);
    if (!current || matchPriority(entry) > matchPriority(current)) selected.set(key, entry);
  }
  for (const entry of selected.values()) matches[entry.sourceTerm] = entry.targetTerm;
  return matches;
}

export class GlossaryStore {
  private store!: JsonStore<GlossaryEntry[]>;
  private entries: GlossaryEntry[] = [];
  async initialize(): Promise<void> { this.store = new JsonStore(join(app.getPath("userData"), "glossary.json"), []); this.entries = await this.store.read(); }
  list(): GlossaryEntry[] { return structuredClone(this.entries); }
  conflicts(): GlossaryConflict[] { return structuredClone(findGlossaryConflicts(this.entries)); }
  matches(text: string, sourceLanguage = "auto", targetLanguage = "auto"): Record<string, string> { return findGlossaryMatches(text, this.entries, sourceLanguage, targetLanguage); }
  async upsert(entry: GlossaryEntry): Promise<GlossaryEntry> {
    const now = Date.now();
    const value = { ...entry, id: entry.id || randomUUID(), sourceTerm: entry.sourceTerm.trim(), targetTerm: entry.targetTerm.trim(), createdAt: entry.createdAt || now, updatedAt: now };
    if (!value.sourceTerm || !value.targetTerm) throw new Error("术语原文和译文不能为空。 ");
    const index = this.entries.findIndex((item) => item.id === value.id);
    if (index < 0) this.entries.unshift(value); else this.entries[index] = value;
    await this.store.write(this.entries); return structuredClone(value);
  }
  async import(entries: GlossaryEntry[]): Promise<void> {
    if (!entries.length) return;
    this.entries = [...entries, ...this.entries];
    await this.store.write(this.entries);
  }
  async clear(): Promise<void> { this.entries = []; await this.store.write(this.entries); }
  async delete(id: string): Promise<void> { this.entries = this.entries.filter((entry) => entry.id !== id); await this.store.write(this.entries); }
}
