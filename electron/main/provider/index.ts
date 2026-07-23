import { OllamaProvider } from "./ollama";
import { OpenAICompatibleProvider } from "./openai";
import type { TranslationProvider } from "./types";
import type { AppSettings } from "../../shared/types";

export function createProvider(settings: AppSettings): TranslationProvider {
  return settings.provider.type === "ollama"
    ? new OllamaProvider(settings.provider, settings)
    : new OpenAICompatibleProvider(settings.provider, settings);
}
