import { describe, expect, it } from "vitest";
import { assembleDocument, chunkDocument } from "../electron/main/document/chunking";

describe("文档分块", () => {
  it("保留 Markdown 代码块，不将其交给翻译", () => {
    const chunks = chunkDocument("# Title\n\nHello world.\n\n```ts\nconst url = 'https://a.test';\n```", "markdown");
    expect(chunks.some((chunk) => !chunk.translatable && chunk.source.startsWith("```ts"))).toBe(true);
  });
  it("保留 SRT 序号与时间轴", () => {
    const chunks = chunkDocument("1\n00:00:01,000 --> 00:00:02,000\nHello\n\n2\n00:00:03,000 --> 00:00:04,000\nWorld", "srt");
    expect(assembleDocument(chunks, { "chunk-1": "你好", "chunk-2": "世界" })).toContain("00:00:01,000 --> 00:00:02,000\n你好");
  });
  it("将提取后的 PDF 纯文本按普通段落分块", () => {
    const chunks = chunkDocument("First PDF paragraph.\n\nSecond PDF paragraph.", "pdf");
    expect(chunks).toEqual([{ id: "chunk-1", source: "First PDF paragraph.\n\nSecond PDF paragraph.", translatable: true }]);
  });
  it("代码预览只将注释内容交给翻译，并保留代码与换行", () => {
    const chunks = chunkDocument("// Explain this\nconst value = 1;\n# YAML note\nkey: value\n", "code");
    expect(chunks).toEqual([
      { id: "chunk-1", source: "Explain this", prefix: "// ", suffix: "\n", translatable: true },
      { id: "chunk-2", source: "const value = 1;\n", translatable: false },
      { id: "chunk-3", source: "YAML note", prefix: "# ", suffix: "\n", translatable: true },
      { id: "chunk-4", source: "key: value\n", translatable: false }
    ]);
    expect(assembleDocument(chunks, { "chunk-1": "解释这里", "chunk-3": "YAML 注释" })).toBe("// 解释这里\nconst value = 1;\n# YAML 注释\nkey: value\n");
  });
});
