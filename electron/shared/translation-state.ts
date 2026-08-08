import { assembleDisplayText } from "./text-assembly";
import type { TranslationEvent, TranslationState } from "./types";

/** Shared event reducer used by the main-process session and Renderer UI. */
export function reduceTranslationState(state: TranslationState, event: TranslationEvent): TranslationState {
  if (state.requestId && state.requestId !== event.requestId) return state;
  const next: TranslationState = { ...state, requestId: event.requestId };
  if (!(event.status === "success" && state.status === "success" && event.warning)) next.status = event.status;
  if (event.status === "streaming" && event.content) next.content = `${next.content}${event.content}`;
  if (event.segment) {
    const current = next.result;
    const segments = [...(current?.segments ?? [])];
    const index = segments.findIndex((item) => item.id === event.segment!.id);
    if (index >= 0) segments[index] = event.segment;
    else segments.push(event.segment);
    const targetLanguage = current?.targetLanguage ?? "auto";
    const targetText = assembleDisplayText(segments, targetLanguage);
    next.result = current
      ? { ...current, segments, targetText }
      : {
          requestId: event.requestId,
          sourceText: "",
          targetText,
          sourceLanguage: "",
          targetLanguage,
          segments,
          modelInfo: { provider: "ollama", model: "", durationMs: 0 },
          createdAt: Date.now()
        };
    next.content = targetText;
  }
  if (event.status === "success" && event.content) next.content = event.content;
  if (event.status === "success" && event.result) next.result = event.result;
  if (event.historyId) next.historyId = event.historyId;
  if (event.warning) next.warning = event.warning;
  if (event.error) next.error = event.error;
  return next;
}

