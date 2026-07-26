import { describe, expect, it } from "vitest";
import { createTranslationResult } from "../electron/main/translation/result";
import { splitIntoSegments } from "../electron/main/translation/segments";

describe("本地句段切分", () => {
  it("按中英文句界和自然段生成稳定 ID 与原文位置", () => {
    const text = "First sentence. 第二句！\n\n第三段。";
    expect(splitIntoSegments(text)).toEqual([
      { id: "segment-1", source: "First sentence.", sourceStart: 0, sourceEnd: 15 },
      { id: "segment-2", source: "第二句！", sourceStart: 16, sourceEnd: 20 },
      { id: "segment-3", source: "第三段。", sourceStart: 22, sourceEnd: 26 }
    ]);
  });

  it("保护小数、缩写、URL、路径、代码块和括号内标点", () => {
    const text = "Dr. Li paid 3.14 at https://example.com/a.b. See C:\\work\\a.ts. (Keep this. intact.)\n\n```ts\nconsole.log('x.y');\n```";
    expect(splitIntoSegments(text).map((segment) => segment.source)).toEqual([
      "Dr. Li paid 3.14 at https://example.com/a.b.",
      "See C:\\work\\a.ts.",
      "(Keep this. intact.)",
      "```ts\nconsole.log('x.y');\n```"
    ]);
  });

  it("仅在超长句的可靠逗号从句边界继续切分", () => {
    const chinese = "这是第一段长度足够长的中文说明，其中包含多个需要保留的语义内容，用于验证逗号边界可以稳定切分，而不会依赖界面的换行显示。";
    expect(splitIntoSegments(chinese).map((segment) => segment.source)).toEqual([
      "这是第一段长度足够长的中文说明，",
      "其中包含多个需要保留的语义内容，",
      "用于验证逗号边界可以稳定切分，而不会依赖界面的换行显示。"
    ]);

    const english = "This sentence contains enough English words to exceed the recommended segment length, so the first meaningful clause should remain stable, while the second clause keeps its own semantic boundary, and the final clause completes the idea without visual-line assumptions.";
    expect(splitIntoSegments(english).map((segment) => segment.source)).toEqual([
      "This sentence contains enough English words to exceed the recommended segment length,",
      "so the first meaningful clause should remain stable,",
      "while the second clause keeps its own semantic boundary,",
      "and the final clause completes the idea without visual-line assumptions."
    ]);
  });
});

describe("结构化翻译结果", () => {
  const sourceSegments = splitIntoSegments("One. Two.");
  const common = {
    requestId: "request-1",
    sourceText: "One. Two.",
    sourceLanguage: "en",
    targetLanguage: "zh-CN",
    sourceSegments,
    modelInfo: { provider: "ollama" as const, model: "qwen3", durationMs: 12 },
    createdAt: 1
  };

  it("仅接受完整且 ID 一致的模型结果", () => {
    const result = createTranslationResult({
      ...common,
      responseText: '{"segments":[{"id":"segment-1","target":"一。"},{"id":"segment-2","target":"二。"}]}'
    });
    expect(result.targetText).toBe("一。\n二。");
    expect(result.segments.map((segment) => [segment.id, segment.targetStart, segment.targetEnd])).toEqual([
      ["segment-1", 0, 2], ["segment-2", 3, 5]
    ]);
  });

  it("非法 JSON、缺失或重复 ID 时回退为普通全文译文", () => {
    for (const responseText of [
      "普通译文",
      '{"segments":[{"id":"segment-1","target":"一"}]}',
      '{"segments":[{"id":"segment-1","target":"一"},{"id":"segment-1","target":"二"}]}'
    ]) {
      const result = createTranslationResult({ ...common, responseText });
      expect(result.segments).toEqual([]);
      expect(result.targetText).toBe(responseText);
    }
  });

  it("保留当前请求命中的术语校验结果", () => {
    const result = createTranslationResult({
      ...common,
      responseText: '{"segments":[{"id":"segment-1","target":"一。"},{"id":"segment-2","target":"二。"}]}',
      promptVersion: "v3.1",
      glossaryValidation: [{ sourceTerm: "API", targetTerm: "接口", applied: true }]
    });
    expect(result.glossaryValidation).toEqual([{ sourceTerm: "API", targetTerm: "接口", applied: true }]);
    expect(result.promptVersion).toBe("v3.1");
  });
});
