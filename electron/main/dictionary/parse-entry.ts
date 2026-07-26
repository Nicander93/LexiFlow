import type { DictionaryEntry, DictionaryForm, DictionaryLabels, DictionarySense } from "../../shared/types";

export const EXAM_LABELS: Record<string, string> = {
  zk: "中考",
  gk: "高考",
  cet4: "CET4",
  cet6: "CET6",
  ky: "考研",
  ielts: "IELTS",
  toefl: "TOEFL",
  gre: "GRE"
};

export const FORM_LABELS: Record<string, string> = {
  p: "过去式",
  d: "过去分词",
  i: "现在分词",
  "3": "第三人称单数",
  r: "比较级",
  t: "最高级",
  s: "复数",
  "0": "原形"
};

const POS_PREFIX = /^(n|v|vt|vi|a|adj|adv|prep|pron|conj|num|art|int|aux|phr)\.\s*/i;

export interface RawDictionaryRow {
  word: string;
  phonetic?: string | null;
  definition?: string | null;
  translation: string;
  pos?: string | null;
  collins?: number | null;
  oxford?: number | null;
  tag?: string | null;
  bnc?: number | null;
  frq?: number | null;
  exchange?: string | null;
}

export function normalizePosLabel(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower === "a.") return "adj.";
  return lower;
}

export function parseTranslationSenses(translation: string, definition?: string | null): DictionarySense[] {
  const lines = translation
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("[网络]"));

  const senses: DictionarySense[] = [];
  for (const line of lines) {
    const match = line.match(POS_PREFIX);
    const partOfSpeech = match ? normalizePosLabel(`${match[1]}.`) : undefined;
    const text = match ? line.slice(match[0].length).trim() : line;
    if (!text) continue;

    const last = senses[senses.length - 1];
    if (last && last.partOfSpeech === partOfSpeech) {
      last.translations.push(text);
    } else {
      senses.push({ partOfSpeech, translations: [text] });
    }
  }

  const definitionLines = (definition ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (definitionLines.length) {
    if (!senses.length) {
      senses.push({ translations: [], definitions: definitionLines });
    } else {
      senses[0].definitions = [...(senses[0].definitions ?? []), ...definitionLines];
    }
  }

  return senses;
}

export function parseExchangeForms(exchange?: string | null): DictionaryForm[] {
  if (!exchange?.trim()) return [];
  const forms: DictionaryForm[] = [];
  for (const part of exchange.split("/")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) continue;
    const code = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    if (!code || !value) continue;
    if (code === "1") continue;
    const label = FORM_LABELS[code];
    if (!label) continue;
    forms.push({ code, label, value });
  }
  return forms;
}

export function parseExamLabels(tag?: string | null): string[] {
  if (!tag?.trim()) return [];
  const labels: string[] = [];
  for (const token of tag.split(/\s+/)) {
    const mapped = EXAM_LABELS[token.toLowerCase()];
    if (mapped && !labels.includes(mapped)) labels.push(mapped);
  }
  return labels;
}

export function buildDictionaryLabels(row: RawDictionaryRow): DictionaryLabels {
  const collins = Number(row.collins ?? 0);
  const oxford = Number(row.oxford ?? 0);
  const bnc = Number(row.bnc ?? 0);
  const frq = Number(row.frq ?? 0);
  return {
    exams: parseExamLabels(row.tag),
    collinsStars: collins > 0 ? collins : undefined,
    oxford3000: oxford > 0,
    bncRank: bnc > 0 ? bnc : undefined,
    contemporaryRank: frq > 0 ? frq : undefined
  };
}

export function toDictionaryEntry(row: RawDictionaryRow): DictionaryEntry {
  return {
    headword: row.word,
    phonetic: row.phonetic?.trim() || undefined,
    senses: parseTranslationSenses(row.translation, row.definition),
    forms: parseExchangeForms(row.exchange),
    labels: buildDictionaryLabels(row)
  };
}
