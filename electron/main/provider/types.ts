import type {
  ModelInfo,
  ProviderHealth,
  TranslationChunk,
  TranslationRequest
} from "../../shared/types";

export interface TranslationProvider {
  getModels(signal?: AbortSignal): Promise<ModelInfo[]>;
  healthCheck(signal?: AbortSignal): Promise<ProviderHealth>;
  translate(request: TranslationRequest, signal?: AbortSignal): AsyncIterable<TranslationChunk>;
}
