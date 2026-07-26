import type { DictionaryEntry, DictionaryLookupResult } from "../../electron/shared/types";

const PREVIEW_ENTRIES: Record<string, DictionaryEntry> = {
  sorry: {
    headword: "sorry",
    phonetic: "/ˈsɒri/",
    senses: [
      { partOfSpeech: "adj.", translations: ["抱歉的；惭愧的；难过的"] },
      { partOfSpeech: "int.", translations: ["对不起；抱歉；没听清，请再讲一次"] }
    ],
    forms: [
      { code: "r", label: "比较级", value: "sorrier" },
      { code: "t", label: "最高级", value: "sorriest" }
    ],
    labels: { exams: ["中考", "高考", "CET4", "CET6", "考研"], collinsStars: 3, oxford3000: true }
  },
  repository: {
    headword: "repository",
    phonetic: "/rɪˈpɒzɪtəri/",
    senses: [{ partOfSpeech: "n.", translations: ["仓库；贮藏室；代码仓库"] }],
    forms: [],
    labels: { exams: [], oxford3000: false }
  },
  buffer: {
    headword: "buffer",
    phonetic: "/ˈbʌfə/",
    senses: [
      { partOfSpeech: "n.", translations: ["缓冲区"] },
      { partOfSpeech: "v.", translations: ["缓冲"] }
    ],
    forms: [],
    labels: { exams: [], collinsStars: 2, oxford3000: false, bncRank: 25000, contemporaryRank: 22000 }
  }
};

export function previewDictionaryLookup(query: string): DictionaryLookupResult {
  const key = query.trim().toLowerCase();
  const entry = PREVIEW_ENTRIES[key];
  if (!entry) {
    return {
      query,
      normalizedQuery: query.trim(),
      found: false,
      matchType: "none",
      suggestions: Object.keys(PREVIEW_ENTRIES)
    };
  }
  return {
    query,
    normalizedQuery: query.trim(),
    found: true,
    matchType: "exact",
    entry: structuredClone(entry),
    suggestions: []
  };
}
