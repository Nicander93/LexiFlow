import { buildAlternativesPrompt, buildDictionaryContextPrompt, buildPrompt, buildRevisionPrompt } from "../core/prompt";
import { buildModelOptions } from "../core/model-options";
import { createRequestSignal, ensureResponse, normalizeBaseUrl } from "./http";
import { parseOllamaLine, readDelimitedStream } from "./stream";
import type { TranslationProvider } from "./types";
import type {
  AppSettings,
  ProviderModel,
  ProviderConfig,
  ProviderHealth,
  TranslationChunk,
  TranslationRequest,
  SourceSegment,
  DictionaryContextRequest
  ,SegmentRevisionRequest
  ,SegmentAlternativeRequest
} from "../../shared/types";

export class OllamaProvider implements TranslationProvider {
  constructor(
    private readonly config: ProviderConfig,
    private readonly settings: AppSettings
  ) {}

  private thinkEnabled(): boolean {
    return this.config.enableReasoning === true;
  }

  async healthCheck(signal?: AbortSignal): Promise<ProviderHealth> {
    try {
      const response = await fetch(`${normalizeBaseUrl(this.config.baseUrl)}/api/tags`, {
        signal: createRequestSignal(Math.min(this.config.timeoutMs, 5_000), signal)
      });
      await ensureResponse(response);
      return { ok: true, message: "Ollama 服务连接正常。" };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Ollama 服务不可用。" };
    }
  }

  async getModels(signal?: AbortSignal): Promise<ProviderModel[]> {
    const response = await fetch(`${normalizeBaseUrl(this.config.baseUrl)}/api/tags`, {
      signal: createRequestSignal(this.config.timeoutMs, signal)
    });
    await ensureResponse(response);
    const payload = (await response.json()) as { models?: Array<{ name: string }> };
    return (payload.models ?? []).map((model) => ({ id: model.name, name: model.name }));
  }

  async *translate(request: TranslationRequest, signal?: AbortSignal, segments?: SourceSegment[]): AsyncIterable<TranslationChunk> {
    const prompt = buildPrompt(request, this.settings, segments);
    const options = buildModelOptions(request.text.length, request.temperature);
    const response = await fetch(`${normalizeBaseUrl(this.config.baseUrl)}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.model,
        stream: true,
        keep_alive: this.config.keepAlive,
        think: this.thinkEnabled(),
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user }
        ],
        options: {
          temperature: options.temperature,
          top_p: options.topP,
          num_predict: options.maxTokens
        }
      }),
      signal: createRequestSignal(this.config.timeoutMs, signal)
    });
    await ensureResponse(response);
    if (!response.body) throw new Error("模型服务未返回流式内容。 ");
    yield* readDelimitedStream(response.body, "\n", parseOllamaLine);
  }

  async *revise(request: SegmentRevisionRequest, signal?: AbortSignal): AsyncIterable<TranslationChunk> {
    const prompt = buildRevisionPrompt(request, this.settings);
    const response = await fetch(`${normalizeBaseUrl(this.config.baseUrl)}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.config.model, stream: true, keep_alive: this.config.keepAlive, think: this.thinkEnabled(), messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }], options: { temperature: 0.2, top_p: 0.8 } }),
      signal: createRequestSignal(this.config.timeoutMs, signal)
    });
    await ensureResponse(response);
    if (!response.body) throw new Error("模型服务未返回流式内容。 ");
    yield* readDelimitedStream(response.body, "\n", parseOllamaLine);
  }

  async *alternatives(request: SegmentAlternativeRequest, signal?: AbortSignal): AsyncIterable<TranslationChunk> {
    const prompt = buildAlternativesPrompt(request, this.settings);
    const response = await fetch(`${normalizeBaseUrl(this.config.baseUrl)}/api/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.config.model, stream: true, keep_alive: this.config.keepAlive, think: this.thinkEnabled(), messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }], options: { temperature: 0.35, top_p: 0.9 } }),
      signal: createRequestSignal(this.config.timeoutMs, signal)
    });
    await ensureResponse(response);
    if (!response.body) throw new Error("模型服务未返回流式内容。 ");
    yield* readDelimitedStream(response.body, "\n", parseOllamaLine);
  }

  async *explainDictionary(request: DictionaryContextRequest, signal?: AbortSignal): AsyncIterable<TranslationChunk> {
    const prompt = buildDictionaryContextPrompt(request, this.settings);
    const response = await fetch(`${normalizeBaseUrl(this.config.baseUrl)}/api/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.config.model, stream: true, keep_alive: this.config.keepAlive, think: this.thinkEnabled(), messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }], options: { temperature: 0.1, top_p: 0.8, num_predict: 160 } }),
      signal: createRequestSignal(this.config.timeoutMs, signal)
    });
    await ensureResponse(response);
    if (!response.body) throw new Error("模型服务未返回流式内容。 ");
    yield* readDelimitedStream(response.body, "\n", parseOllamaLine);
  }

  async *chat(messages: Array<{ role: "system" | "user"; content: string }>, signal?: AbortSignal): AsyncIterable<TranslationChunk> {
    const response = await fetch(`${normalizeBaseUrl(this.config.baseUrl)}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.model,
        stream: true,
        keep_alive: this.config.keepAlive,
        think: this.thinkEnabled(),
        messages,
        options: { temperature: 0, top_p: 0.8, num_predict: 2_048 }
      }),
      signal: createRequestSignal(this.config.timeoutMs, signal)
    });
    await ensureResponse(response);
    if (!response.body) throw new Error("模型服务未返回流式内容。 ");
    yield* readDelimitedStream(response.body, "\n", parseOllamaLine);
  }
}
