import { describe, expect, it } from "vitest";
import {
  parseExchangeForms,
  parseTranslationSenses,
  toDictionaryEntry
} from "../electron/main/dictionary/parse-entry";

describe("dictionary parse", () => {
  it("parses multi-pos translations and hides network lines", () => {
    const senses = parseTranslationSenses(
      "a. 抱歉的；惭愧的\nint. 对不起\n[网络] 忽略\n\n难过的",
      "feeling regret"
    );
    expect(senses).toEqual([
      { partOfSpeech: "adj.", translations: ["抱歉的；惭愧的"], definitions: ["feeling regret"] },
      { partOfSpeech: "int.", translations: ["对不起"] },
      { partOfSpeech: undefined, translations: ["难过的"] }
    ]);
  });

  it("maps a. to adj.", () => {
    expect(parseTranslationSenses("a. 快乐的")[0].partOfSpeech).toBe("adj.");
  });

  it("parses exchange forms", () => {
    expect(parseExchangeForms("p:perceived/d:perceived/i:perceiving/3:perceives")).toEqual([
      { code: "p", label: "过去式", value: "perceived" },
      { code: "d", label: "过去分词", value: "perceived" },
      { code: "i", label: "现在分词", value: "perceiving" },
      { code: "3", label: "第三人称单数", value: "perceives" }
    ]);
    expect(parseExchangeForms("r:sorrier/t:sorriest")).toHaveLength(2);
    expect(parseExchangeForms("s:teeth/0:tooth")).toEqual([
      { code: "s", label: "复数", value: "teeth" },
      { code: "0", label: "原形", value: "tooth" }
    ]);
  });

  it("builds entry DTO without requiring english definition", () => {
    const entry = toDictionaryEntry({
      word: "buffer",
      translation: "n. 缓冲区",
      tag: "cet4",
      collins: 2,
      oxford: 0,
      bnc: 100,
      frq: 200
    });
    expect(entry.headword).toBe("buffer");
    expect(entry.senses[0].translations).toEqual(["缓冲区"]);
    expect(entry.labels.exams).toEqual(["CET4"]);
    expect(entry.labels.collinsStars).toBe(2);
    expect(entry.labels.bncRank).toBe(100);
  });
});
