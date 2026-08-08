import { computed, onUnmounted, ref } from "vue";
import type {
  TranslationResult,
  TranslationRequest,
  TranslationStatus,
  TranslationState
} from "../../../electron/shared/types";
import { reduceTranslationState } from "../../../electron/shared/translation-state";
import { getTranslatorApi } from "../../platform/translator";
import { toIpcPayload } from "../../../electron/shared/serialization";

export function useTranslation() {
  const translator = getTranslatorApi();
  const status = ref<TranslationStatus>("idle");
  const resultText = ref("");
  const result = ref<TranslationResult>();
  const errorMessage = ref("");
  const warningMessage = ref("");
  const historyId = ref<string>();
  const currentRequestId = ref<string>();
  let lastRequest: TranslationRequest | undefined;
  let reducerState: TranslationState = { status: "idle", content: "" };

  const removeListener = translator.translation.onEvent((event) => {
    reducerState = reduceTranslationState(reducerState, event);
    currentRequestId.value = reducerState.requestId;
    status.value = reducerState.status;
    resultText.value = reducerState.content;
    result.value = reducerState.result;
    historyId.value = reducerState.historyId;
    if (reducerState.warning) warningMessage.value = reducerState.warning;
    if (reducerState.error) errorMessage.value = reducerState.error;
  });

  async function start(request: TranslationRequest): Promise<void> {
    stop();
    const payload = toIpcPayload(request);
    lastRequest = structuredClone(payload);
    currentRequestId.value = undefined;
    resultText.value = "";
    result.value = undefined;
    errorMessage.value = "";
    warningMessage.value = "";
    historyId.value = undefined;
    reducerState = { status: "loading", content: "" };
    status.value = "loading";
    try {
      const requestId = await translator.translation.start(payload);
      currentRequestId.value ??= requestId;
    } catch (error) {
      status.value = "error";
      errorMessage.value = error instanceof Error ? error.message : "无法启动翻译请求，请重启应用后重试。";
    }
  }

  function stop(): void {
    if (currentRequestId.value) translator.translation.cancel(currentRequestId.value);
    currentRequestId.value = undefined;
  }

  function reset(): void {
    stop();
    currentRequestId.value = undefined;
    resultText.value = "";
    result.value = undefined;
    errorMessage.value = "";
    warningMessage.value = "";
    historyId.value = undefined;
    reducerState = { status: "idle", content: "" };
    status.value = "idle";
    lastRequest = undefined;
  }

  async function retry(): Promise<void> {
    if (lastRequest) await start(lastRequest);
  }

  const isRunning = computed(() => status.value === "loading" || status.value === "streaming");

  onUnmounted(() => {
    stop();
    removeListener();
  });

  return { status, resultText, result, errorMessage, warningMessage, historyId, isRunning, start, stop, retry, reset };
}
