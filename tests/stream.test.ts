import { describe, expect, it } from "vitest";
import { parseOllamaLine, parseOpenAIEvent, readDelimitedStream } from "../electron/main/provider/stream";

describe("Ollama 流式响应", () => {
  it("解析 token 和结束标记", () => {
    expect(parseOllamaLine('{"message":{"content":"你好"},"done":false}')).toEqual({ content: "你好", done: false });
    expect(parseOllamaLine('{"message":{"content":""},"done":true}')).toEqual({ content: "", done: true });
  });
});

describe("OpenAI-compatible SSE", () => {
  it("解析 token 和 DONE", () => {
    expect(parseOpenAIEvent('data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}')).toEqual({ content: "Hello", done: false });
    expect(parseOpenAIEvent("data: [DONE]")).toEqual({ content: "", done: true });
  });

  it("正确处理跨网络分片的数据", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"message":{"content":"A"}'));
        controller.enqueue(encoder.encode(',"done":false}\n{"message":{"content":"B"},"done":true}\n'));
        controller.close();
      }
    });
    const chunks = [];
    for await (const chunk of readDelimitedStream(stream, "\n", parseOllamaLine)) chunks.push(chunk);
    expect(chunks).toEqual([{ content: "A", done: false }, { content: "B", done: true }]);
  });
});
