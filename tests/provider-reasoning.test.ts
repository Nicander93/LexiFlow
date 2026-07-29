import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../electron/shared/defaults";
import { OllamaProvider } from "../electron/main/provider/ollama";
import { OpenAICompatibleProvider, buildReasoningBody } from "../electron/main/provider/openai";
import type { AppSettings, ProviderConfig } from "../electron/shared/types";

function settingsWith(provider: Partial<ProviderConfig>): AppSettings {
  return {
    ...structuredClone(DEFAULT_SETTINGS),
    provider: { ...DEFAULT_SETTINGS.provider, ...provider }
  };
}

function sseBody(content: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: {"choices":[{"delta":{"content":${JSON.stringify(content)}},"finish_reason":null}]}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    }
  });
}

function ollamaBody(content: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`{"message":{"content":${JSON.stringify(content)}},"done":false}\n`));
      controller.enqueue(encoder.encode('{"message":{"content":""},"done":true}\n'));
      controller.close();
    }
  });
}

describe("buildReasoningBody", () => {
  it("默认关闭 reasoning", () => {
    expect(buildReasoningBody(undefined)).toEqual({
      reasoning_effort: "none",
      chat_template_kwargs: { enable_thinking: false }
    });
    expect(buildReasoningBody(false)).toEqual({
      reasoning_effort: "none",
      chat_template_kwargs: { enable_thinking: false }
    });
  });

  it("开启时传 medium", () => {
    expect(buildReasoningBody(true)).toEqual({
      reasoning_effort: "medium",
      chat_template_kwargs: { enable_thinking: true }
    });
  });
});

describe("Provider enableReasoning 请求体", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("Ollama 默认 think:false，开启后为 true", async () => {
    const bodies: Array<{ think?: boolean }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)) as { think?: boolean });
        return new Response(ollamaBody("ok"), { status: 200 });
      })
    );

    const off = new OllamaProvider(settingsWith({ enableReasoning: false }).provider, settingsWith({ enableReasoning: false }));
    for await (const _ of off.chat([{ role: "user", content: "hi" }])) {
      // drain
    }
    const on = new OllamaProvider(settingsWith({ enableReasoning: true }).provider, settingsWith({ enableReasoning: true }));
    for await (const _ of on.chat([{ role: "user", content: "hi" }])) {
      // drain
    }

    expect(bodies[0]?.think).toBe(false);
    expect(bodies[1]?.think).toBe(true);
  });

  it("OpenAI-compatible 默认 reasoning_effort:none", async () => {
    const bodies: Array<{ reasoning_effort?: string; chat_template_kwargs?: { enable_thinking?: boolean } }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)) as (typeof bodies)[number]);
        return new Response(sseBody("ok"), { status: 200 });
      })
    );

    const settings = settingsWith({ type: "openai-compatible", apiKey: "test-key", enableReasoning: false });
    const provider = new OpenAICompatibleProvider(settings.provider, settings);
    for await (const _ of provider.chat([{ role: "user", content: "hi" }])) {
      // drain
    }

    expect(bodies[0]?.reasoning_effort).toBe("none");
    expect(bodies[0]?.chat_template_kwargs?.enable_thinking).toBe(false);
  });

  it("OpenAI-compatible 开启后 reasoning_effort:medium", async () => {
    const bodies: Array<{ reasoning_effort?: string; chat_template_kwargs?: { enable_thinking?: boolean } }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)) as (typeof bodies)[number]);
        return new Response(sseBody("ok"), { status: 200 });
      })
    );

    const settings = settingsWith({ type: "openai-compatible", apiKey: "test-key", enableReasoning: true });
    const provider = new OpenAICompatibleProvider(settings.provider, settings);
    for await (const _ of provider.chat([{ role: "user", content: "hi" }])) {
      // drain
    }

    expect(bodies[0]?.reasoning_effort).toBe("medium");
    expect(bodies[0]?.chat_template_kwargs?.enable_thinking).toBe(true);
  });
});

describe("DEFAULT_SETTINGS", () => {
  it("enableReasoning 默认为 false", () => {
    expect(DEFAULT_SETTINGS.provider.enableReasoning).toBe(false);
  });
});
