import type {
  ProviderModel,
  ProviderHealth,
  SourceSegment,
  DictionaryContextRequest,
  SegmentRevisionRequest,
  SegmentAlternativeRequest,
  TranslationChunk,
  TranslationRequest
} from "../../shared/types";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface TranslationProvider {
  getModels(signal?: AbortSignal): Promise<ProviderModel[]>;
  healthCheck(signal?: AbortSignal): Promise<ProviderHealth>;
  translate(request: TranslationRequest, signal?: AbortSignal, segments?: SourceSegment[]): AsyncIterable<TranslationChunk>;
  revise(request: SegmentRevisionRequest, signal?: AbortSignal): AsyncIterable<TranslationChunk>;
  alternatives(request: SegmentAlternativeRequest, signal?: AbortSignal): AsyncIterable<TranslationChunk>;
  explainDictionary(request: DictionaryContextRequest, signal?: AbortSignal): AsyncIterable<TranslationChunk>;
  /** Low-level completion used for one-shot structured-output repair. */
  chat(messages: ChatMessage[], signal?: AbortSignal): AsyncIterable<TranslationChunk>;
}
