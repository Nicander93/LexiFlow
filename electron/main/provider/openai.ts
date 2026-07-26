import { buildAlternativesPrompt, buildDictionaryContextPrompt, buildPrompt, buildRevisionPrompt } from "../core/prompt";
import { buildModelOptions } from "../core/model-options";
import { UserFacingError } from "../core/errors";
import { createRequestSignal, ensureResponse, normalizeBaseUrl } from "./http";
import { parseOpenAIEvent, readDelimitedStream } from "./stream";
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

export class OpenAICompatibleProvider implements TranslationProvider {
  constructor(
    private readonly config: ProviderConfig,
    private readonly settings: AppSettings
  ) {}

  private headers(): Record<string, string> {
    if (!this.config.apiKey) throw new UserFacingError("请先在设置中填写 API Key。 ");
    return { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` };
  }

  async healthCheck(signal?: AbortSignal): Promise<ProviderHealth> {
    try {
      await this.getModels(signal);
      return { ok: true, message: "OpenAI-compatible 服务连接正常。" };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "模型服务不可用。" };
    }
  }

  async getModels(signal?: AbortSignal): Promise<ProviderModel[]> {
    const response = await fetch(`${normalizeBaseUrl(this.config.baseUrl)}/models`, {
      headers: this.headers(),
      signal: createRequestSignal(this.config.timeoutMs, signal)
    });
    await ensureResponse(response);
    const payload = (await response.json()) as { data?: Array<{ id: string }> };
    return (payload.data ?? []).map((model) => ({ id: model.id, name: model.id }));
  }

  async *translate(request: TranslationRequest, signal?: AbortSignal, segments?: SourceSegment[]): AsyncIterable<TranslationChunk> {
    const prompt = buildPrompt(request, this.settings, segments);
    const options = buildModelOptions(request.text.length, request.temperature);
    const response = await fetch(`${normalizeBaseUrl(this.config.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: this.config.model,
        stream: true,
        temperature: options.temperature,
        top_p: options.topP,
        max_tokens: options.maxTokens,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user }
        ]
      }),
      signal: createRequestSignal(this.config.timeoutMs, signal)
    });
    await ensureResponse(response);
    if (!response.body) throw new Error("模型服务未返回流式内容。 ");
    yield* readDelimitedStream(response.body, "\n\n", parseOpenAIEvent);
  }

  async *revise(request: SegmentRevisionRequest, signal?: AbortSignal): AsyncIterable<TranslationChunk> {
    const prompt = buildRevisionPrompt(request, this.settings);
    const response = await fetch(`${normalizeBaseUrl(this.config.baseUrl)}/chat/completions`, {
      method: "POST", headers: this.headers(),
      body: JSON.stringify({ model: this.config.model, stream: true, temperature: 0.2, top_p: 0.8, messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }] }),
      signal: createRequestSignal(this.config.timeoutMs, signal)
    });
    await ensureResponse(response);
    if (!response.body) throw new Error("模型服务未返回流式内容。 ");
    yield* readDelimitedStream(response.body, "\n\n", parseOpenAIEvent);
  }

  async *alternatives(request: SegmentAlternativeRequest, signal?: AbortSignal): AsyncIterable<TranslationChunk> {
    const prompt = buildAlternativesPrompt(request, this.settings);
    const response = await fetch(`${normalizeBaseUrl(this.config.baseUrl)}/chat/completions`, {
      method: "POST", headers: this.headers(),
      body: JSON.stringify({ model: this.config.model, stream: true, temperature: 0.35, top_p: 0.9, messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }] }),
      signal: createRequestSignal(this.config.timeoutMs, signal)
    });
    await ensureResponse(response);
    if (!response.body) throw new Error("模型服务未返回流式内容。 ");
    yield* readDelimitedStream(response.body, "\n\n", parseOpenAIEvent);
  }

  async *explainDictionary(request: DictionaryContextRequest, signal?: AbortSignal): AsyncIterable<TranslationChunk> {
    const prompt = buildDictionaryContextPrompt(request, this.settings);
    const response = await fetch(`${normalizeBaseUrl(this.config.baseUrl)}/chat/completions`, {
      method: "POST", headers: this.headers(),
      body: JSON.stringify({ model: this.config.model, stream: true, temperature: 0.1, top_p: 0.8, max_tokens: 160, messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }] }),
      signal: createRequestSignal(this.config.timeoutMs, signal)
    });
    await ensureResponse(response);
    if (!response.body) throw new Error("模型服务未返回流式内容。 ");
    yield* readDelimitedStream(response.body, "\n\n", parseOpenAIEvent);
  }

  async *chat(messages: Array<{ role: "system" | "user"; content: string }>, signal?: AbortSignal): AsyncIterable<TranslationChunk> {
    const response = await fetch(`${normalizeBaseUrl(this.config.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ model: this.config.model, stream: true, temperature: 0, top_p: 0.8, max_tokens: 2_048, messages }),
      signal: createRequestSignal(this.config.timeoutMs, signal)
    });
    await ensureResponse(response);
    if (!response.body) throw new Error("模型服务未返回流式内容。 ");
    yield* readDelimitedStream(response.body, "\n\n", parseOpenAIEvent);
  }
}
