import { describe, expect, it } from "vitest";
import { cleanInputText, prepareTranslationInput } from "../electron/main/core/text-cleanup";

const defaults = { preserveOriginalLineBreaks: false, protectCodeBlocks: true };

describe("输入文本清理", () => {
  it("合并 PDF 硬换行、恢复英文断词并保留段落", () => {
    expect(cleanInputText("Artifi-\ncial intelligence\nchanges work.\n\nA new paragraph.", defaults))
      .toBe("Artificial intelligence changes work.\n\nA new paragraph.");
  });

  it("保留 Markdown 标题、列表、URL、路径和代码块", () => {
    const text = "# Title\n- Keep this item\n- Keep C:\\work\\app.ts\n\nRead https://example.com/a.b\ncarefully.\n\n```ts\nconst  value = 'x';\n```";
    expect(cleanInputText(text, defaults)).toBe("# Title\n- Keep this item\n- Keep C:\\work\\app.ts\n\nRead https://example.com/a.b carefully.\n\n```ts\nconst  value = 'x';\n```");
  });

  it("允许关闭换行合并", () => {
    expect(cleanInputText("one\ntwo", { ...defaults, preserveOriginalLineBreaks: true })).toBe("one\ntwo");
  });

  it("prepareTranslationInput 保留原文与清理动作", () => {
    const prepared = prepareTranslationInput("Artifi-\ncial intelligence", defaults);
    expect(prepared.originalText).toBe("Artifi-\ncial intelligence");
    expect(prepared.normalizedText).toBe("Artificial intelligence");
    expect(prepared.cleanupActions.some((item) => item.type === "remove-soft-wraps")).toBe(true);
  });

  it("清理失败时可回退：空结果仍返回可翻译文本", () => {
    const prepared = prepareTranslationInput("  hello  ", { ...defaults, preserveOriginalLineBreaks: true });
    expect(prepared.normalizedText).toBe("hello");
    expect(prepared.originalText).toBe("  hello  ");
  });
});
