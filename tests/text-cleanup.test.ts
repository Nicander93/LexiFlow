import { describe, expect, it } from "vitest";
import { cleanInputText } from "../electron/main/core/text-cleanup";

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
});
