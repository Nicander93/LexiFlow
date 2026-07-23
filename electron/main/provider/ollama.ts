import { buildPrompt } from "../core/prompt";
import { buildModelOptions } from "../core/model-options";
import { createRequestSignal, ensureResponse, normalizeBaseUrl } from "./http";
import { parseOllamaLine, readDelimitedStream } from "./stream";
import type { TranslationProvider } from "./types";
import type {
  AppSettings,
  ModelInfo,
  ProviderConfig,
  ProviderHealth,
  TranslationChunk,
  TranslationRequest
} from "../../shared/types";

export class OllamaProvider implements TranslationProvider {
  constructor(
    private readonly config: ProviderConfig,
    private readonly settings: AppSettings
  ) {}

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

  async getModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const response = await fetch(`${normalizeBaseUrl(this.config.baseUrl)}/api/tags`, {
      signal: createRequestSignal(this.config.timeoutMs, signal)
    });
    await ensureResponse(response);
    const payload = (await response.json()) as { models?: Array<{ name: string }> };
    return (payload.models ?? []).map((model) => ({ id: model.name, name: model.name }));
  }

  async *translate(request: TranslationRequest, signal?: AbortSignal): AsyncIterable<TranslationChunk> {
    const prompt = buildPrompt(request, this.settings);
    const options = buildModelOptions(request.text.length);
    const response = await fetch(`${normalizeBaseUrl(this.config.baseUrl)}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.model,
        stream: true,
        keep_alive: this.config.keepAlive,
        think: false,
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
}
