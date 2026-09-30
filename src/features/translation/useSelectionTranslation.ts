import { computed, onUnmounted, ref, type Ref } from "vue";
import { resolveTargetLanguage } from "../../../electron/shared/language";
import { toIpcPayload } from "../../../electron/shared/serialization";
import { reduceTranslationState } from "../../../electron/shared/translation-state";
import type { TranslationEvent, TranslationState } from "../../../electron/shared/types";
import { getTranslatorApi } from "../../platform/translator";

export function useSelectionTranslation(profileId?: Ref<string>) {
  const translator = getTranslatorApi();
  const sourceText = ref("");
  const state = ref<TranslationState>({ status: "idle", content: "" });
  const copied = ref(false);
  const targetLanguage = computed(() => resolveTargetLanguage(sourceText.value, "auto"));
  let requestId: string | undefined;
  let attempt = 0;
  let earlyEvents: TranslationEvent[] | undefined;

  function close(): void {
    attempt += 1;
    if (requestId) translator.selectionTranslation.cancel(requestId);
    requestId = undefined;
    earlyEvents = undefined;
    sourceText.value = "";
    state.value = { status: "idle", content: "" };
    copied.value = false;
  }

  async function start(text: string): Promise<void> {
    if (!text.trim()) return;
    close();
    const currentAttempt = attempt;
    sourceText.value = text.trim();
    state.value = {
      status: "loading", content: "", result: {
        requestId: "", sourceText: sourceText.value, targetText: "", sourceLanguage: "", targetLanguage: targetLanguage.value,
        segments: [], modelInfo: { provider: "ollama", model: "", durationMs: 0 }, createdAt: Date.now()
      }
    };
    earlyEvents = [];
    try {
      const id = await translator.selectionTranslation.start(toIpcPayload({ text: sourceText.value, profileId: profileId?.value }));
      if (currentAttempt !== attempt) {
        translator.selectionTranslation.cancel(id);
        return;
      }
      requestId = id;
      state.value.requestId = id;
      const events = earlyEvents ?? [];
      earlyEvents = undefined;
      events.forEach(handleEvent);
    } catch (error) {
      if (currentAttempt !== attempt) return;
      earlyEvents = undefined;
      state.value = { status: "error", content: "", error: error instanceof Error ? error.message : "选区翻译启动失败，请重试。" };
    }
  }

  function handleEvent(event: TranslationEvent): void {
    if (!requestId || event.requestId !== requestId) return;
    state.value = reduceTranslationState(state.value, event);
    if (event.status === "success" || event.status === "error" || event.status === "cancelled") requestId = undefined;
  }

  function cancel(): void {
    const text = sourceText.value;
    close();
    sourceText.value = text;
    state.value = { status: "cancelled", content: "" };
  }

  async function copy(): Promise<void> {
    if (!state.value.content) return;
    await translator.clipboard.writeText(state.value.content);
    copied.value = true;
  }

  const removeListener = translator.selectionTranslation.onEvent((event) => {
    if (earlyEvents) earlyEvents.push(event);
    else handleEvent(event);
  });
  onUnmounted(() => { close(); removeListener(); });

  return { sourceText, state, targetLanguage, copied, start, close, cancel, copy };
}
