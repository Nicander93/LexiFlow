import type { AppSettings, DictionaryContextRequest, GlossaryEntry, SegmentAlternativeRequest, SegmentRevisionRequest, TranslationProfile } from "../../../shared/types";
import type { SourceSegment, TranslationChunk, TranslationRequest } from "../../../shared/types";

export interface ChatMessage { role: "system" | "user"; content: string; }

export interface ModelGateway {
  translate(request: TranslationRequest, signal?: AbortSignal, segments?: SourceSegment[]): AsyncIterable<TranslationChunk>;
  chat(messages: ChatMessage[], signal?: AbortSignal): AsyncIterable<TranslationChunk>;
}

export interface InteractiveModelGateway extends ModelGateway {
  revise(request: SegmentRevisionRequest, signal?: AbortSignal): AsyncIterable<TranslationChunk>;
  alternatives(request: SegmentAlternativeRequest, signal?: AbortSignal): AsyncIterable<TranslationChunk>;
  explainDictionary(request: DictionaryContextRequest, signal?: AbortSignal): AsyncIterable<TranslationChunk>;
}

export type ModelGatewayFactory = (settings: AppSettings) => ModelGateway;
export type InteractiveModelGatewayFactory = (settings: AppSettings) => InteractiveModelGateway;

export interface TranslationEnginePorts {
  getSettings: () => AppSettings;
  getProfile: (profileId?: string) => TranslationProfile | undefined;
  matchGlossary: (text: string, sourceLanguage: string, targetLanguage: string) => Record<string, string>;
  createGateway: ModelGatewayFactory;
}
