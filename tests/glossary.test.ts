import { describe, expect, it } from "vitest";
import { exportGlossaryCsv, findGlossaryConflicts, findGlossaryMatches, parseGlossaryCsv } from "../electron/main/storage/glossary";
import type { GlossaryEntry } from "../electron/shared/types";
import { getBuiltInProfiles } from "../electron/main/storage/profiles";

const entry: GlossaryEntry = { id: "api", sourceTerm: "API", targetTerm: "接口", sourceLanguage: "en", targetLanguage: "zh-CN", caseSensitive: false, matchMode: "word", enabled: true, createdAt: 1, updatedAt: 1 };

describe("术语表匹配", () => {
  it("只注入当前文本命中的启用术语，并遵守词边界", () => {
    expect(findGlossaryMatches("Read the API document.", [entry])).toEqual({ API: "接口" });
    expect(findGlossaryMatches("An apis test", [entry])).toEqual({});
    expect(findGlossaryMatches("API", [{ ...entry, enabled: false }])).toEqual({});
  });

  it("冲突术语按精确匹配、完整单词、短语和最新更新时间选择", () => {
    const phrase = { ...entry, id: "phrase", targetTerm: "接口短语", matchMode: "phrase" as const, updatedAt: 10 };
    const exact = { ...entry, id: "exact", targetTerm: "应用程序接口", matchMode: "exact" as const, updatedAt: 1 };
    expect(findGlossaryMatches("API", [phrase, exact])).toEqual({ API: "应用程序接口" });
    expect(findGlossaryConflicts([phrase, exact])).toEqual([{ sourceTerm: "API", targets: ["接口短语", "应用程序接口"], entryIds: ["phrase", "exact"] }]);
  });

  it("按源语言和目标语言过滤术语注入", () => {
    const chineseTarget = { ...entry, id: "zh", targetLanguage: "zh-CN" };
    const englishTarget = { ...entry, id: "en", targetTerm: "interface", targetLanguage: "en" };
    expect(findGlossaryMatches("Read API", [chineseTarget, englishTarget], "en", "zh-CN")).toEqual({ API: "接口" });
    expect(findGlossaryMatches("Read API", [chineseTarget, englishTarget], "en", "en")).toEqual({ API: "interface" });
  });

  it("验证 CSV 字段、导入有效术语并正确转义导出内容", () => {
    const csv = "sourceTerm,targetTerm,domain,caseSensitive,matchMode,enabled\nAPI,接口,软件工程,false,word,true\nBad,错误,,maybe,word,true\n";
    const parsed = parseGlossaryCsv(csv, 1);
    expect(parsed.result).toEqual({ imported: 1, skipped: [{ row: 3, reason: "布尔字段必须是 true/false、1/0 或 是/否。" }] });
    expect(parsed.entries[0]).toMatchObject({ sourceTerm: "API", targetTerm: "接口", domain: "软件工程", createdAt: 1 });
    expect(exportGlossaryCsv([{ ...entry, note: "保留 \"API\", 不换行" }])).toContain('"保留 ""API"", 不换行"');
  });
});

describe("内置翻译 Profile", () => {
  it("提供 V3 规定的八个不可编辑场景", () => {
    const profiles = getBuiltInProfiles();
    expect(profiles).toHaveLength(8);
    expect(profiles.map((profile) => profile.id)).toEqual(["general", "technical", "academic", "code-comment", "ui-copy", "variable-naming", "literal-reading", "natural-expression"]);
    expect(profiles.every((profile) => profile.isBuiltIn)).toBe(true);
  });
});
