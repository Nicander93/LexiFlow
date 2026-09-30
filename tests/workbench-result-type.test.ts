import { describe, expect, it } from "vitest";
import { resolveWorkbenchResultType } from "../electron/shared/workbench-result";
import type { NamingResult, TranslationSegment } from "../electron/shared/types";

describe("resolveWorkbenchResultType", () => {
  it("honors the selected reading layout even for a single short sentence", () => {
    const input = {
      mode: "normal" as const, sourceText: "A short sentence.", status: "success" as const,
      displayResultText: "短句。", displaySegments: [{ id: "1", source: "A short sentence.", target: "短句。", sourceStart: 0, sourceEnd: 17 }],
      showMainDictionary: false, namingResult: null
    };
    expect(resolveWorkbenchResultType({ ...input, readingLayout: "bilingual" })).toBe("bilingual");
    expect(resolveWorkbenchResultType({ ...input, sourceText: "x".repeat(300), readingLayout: "translation" })).toBe("translation");
    expect(resolveWorkbenchResultType({ ...input, status: "streaming", readingLayout: "bilingual" })).toBe("loading");
  });
  it("keeps empty state when idle without source", () => {
    expect(resolveWorkbenchResultType({
      mode: "normal",
      sourceText: "",
      status: "idle",
      displayResultText: "",
      displaySegments: [],
      showMainDictionary: false,
      namingResult: null
    })).toBe("empty");
  });

  it("prefers dictionary for eligible word hits", () => {
    expect(resolveWorkbenchResultType({
      mode: "normal",
      sourceText: "architecture",
      status: "idle",
      displayResultText: "",
      displaySegments: [],
      showMainDictionary: true,
      namingResult: null
    })).toBe("dictionary");
  });

  it("uses bilingual for long segmented success", () => {
    const segments = [
      { id: "1", source: "a", target: "甲", sourceStart: 0, sourceEnd: 1 },
      { id: "2", source: "b", target: "乙", sourceStart: 2, sourceEnd: 3 }
    ] as TranslationSegment[];
    expect(resolveWorkbenchResultType({
      mode: "normal",
      sourceText: "x".repeat(241),
      status: "success",
      displayResultText: "甲\n乙",
      displaySegments: segments,
      showMainDictionary: false,
      namingResult: null
    })).toBe("bilingual");
  });

  it("uses naming when naming result is present", () => {
    const naming: NamingResult = {
      recommended: "userLoginStatus",
      candidates: [{ name: "userLoginStatus", meaning: "登录状态" }]
    };
    expect(resolveWorkbenchResultType({
      mode: "naming",
      sourceText: "登录状态",
      status: "success",
      displayResultText: JSON.stringify(naming),
      displaySegments: [],
      showMainDictionary: false,
      namingResult: naming
    })).toBe("naming");
  });

  it("uses short translation for ordinary success sentences", () => {
    expect(resolveWorkbenchResultType({
      mode: "normal",
      sourceText: "temporary drawer created",
      status: "success",
      displayResultText: "已创建临时抽屉。",
      displaySegments: [{ id: "1", source: "temporary drawer created", target: "已创建临时抽屉。", sourceStart: 0, sourceEnd: 24 }],
      showMainDictionary: false,
      namingResult: null
    })).toBe("translation");
  });
});
