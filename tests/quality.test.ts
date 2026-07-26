import { describe, expect, it } from "vitest";
import { checkTranslationQuality } from "../electron/shared/quality";

describe("规则翻译质量检查", () => {
  it("检查数字、URL 和代码块的遗漏，不修改原译文", () => {
    const issues = checkTranslationQuality([{ id: "s1", source: "See https://a.test in 2026. ```ts\nlet x = 1;\n```", target: "请查看链接。", sourceStart: 0, sourceEnd: 50 }]);
    expect(issues.map((item) => item.kind)).toEqual(["number", "url", "code"]);
  });

  it("检查单位、重复译文、目标语言和未命中术语", () => {
    const issues = checkTranslationQuality([
      { id: "s1", source: "速度为 10 km。", target: "The speed is 10.", sourceStart: 0, sourceEnd: 10 },
      { id: "s2", source: "第二句不同。", target: "The speed is 10.", sourceStart: 11, sourceEnd: 18 }
    ], { targetLanguage: "zh-CN", glossaryValidation: [{ sourceTerm: "speed", targetTerm: "速度", applied: false }] });
    expect(issues.map((item) => item.kind)).toEqual(["unit", "language", "duplicate", "language", "glossary"]);
  });
});
