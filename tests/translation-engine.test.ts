import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../electron/shared/defaults";
import { TranslationEngine } from "../electron/main/application/translation/translation-engine";

describe("TranslationEngine", () => {
  it("可在不启动 Electron 的情况下处理文档分块并解析结构化结果", async () => {
    const engine = new TranslationEngine({
      getSettings: () => structuredClone(DEFAULT_SETTINGS),
      getProfile: () => undefined,
      matchGlossary: () => ({}),
      createGateway: () => ({
        translate: async function* () {
          yield { content: '{"id":"chunk-1","target":"你好"}\n', done: true };
        },
        chat: async function* () { yield { content: "", done: true }; }
      })
    });
    const result = await engine.translate({ text: "Hello", profileId: "general", taskType: "document-chunk", targetLanguage: "zh-CN", segmentId: "chunk-1", signal: new AbortController().signal });
    expect(result.targetText).toBe("你好");
    expect(result.segments[0]?.id).toBe("chunk-1");
    expect(result.modelInfo.provider).toBe("ollama");
  });

  it("交互翻译和文档分块共享同一条流式分段管线", async () => {
    const progress: string[] = [];
    const engine = new TranslationEngine({
      getSettings: () => structuredClone(DEFAULT_SETTINGS),
      getProfile: () => undefined,
      matchGlossary: () => ({}),
      createGateway: () => ({
        async *translate() {
          yield { content: '{"id":"segment-1","ta', done: false };
          yield { content: 'rget":"你好"}\n', done: true };
        },
        async *chat() { yield { content: "", done: true }; }
      })
    });
    const result = await engine.translate({
      text: "Hello.",
      taskType: "translation",
      targetLanguage: "zh-CN",
      signal: new AbortController().signal,
      onProgress: (event) => { if (event.type === "segment") progress.push(event.segment.target); }
    });
    expect(result.targetText).toBe("你好");
    expect(progress).toEqual(["你好"]);
    expect(result.sourceSegments[0]?.id).toBe("segment-1");
  });
});
