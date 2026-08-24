import type { DictionaryEntry, VocabularyUpsertInput } from "../../../electron/shared/types";

export function dictionaryEntryToVocabulary(entry: DictionaryEntry, context?: string): VocabularyUpsertInput {
  const translation = entry.senses.slice(0, 4).map((sense) => {
    const prefix = sense.partOfSpeech ? `${sense.partOfSpeech} ` : "";
    return `${prefix}${sense.translations.join("；")}`;
  }).filter(Boolean).join("\n");
  return {
    term: entry.headword,
    translation: translation || "待补充释义",
    phonetic: entry.phonetic,
    sourceLanguage: "en",
    targetLanguage: "zh-CN",
    context,
    status: "learning"
  };
}
