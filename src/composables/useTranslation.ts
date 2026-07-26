import { computed, onUnmounted, ref } from "vue";
import type {
  TranslationResult,
  TranslationRequest,
  TranslationStatus
} from "../../electron/shared/types";
import { getTranslatorApi } from "../platform/translator";
import { toIpcPayload } from "../../electron/shared/serialization";

export function useTranslation() {
  const translator = getTranslatorApi();
  const status = ref<TranslationStatus>("idle");
  const resultText = ref("");
  const result = ref<TranslationResult>();
  const errorMessage = ref("");
  const currentRequestId = ref<string>();
  let lastRequest: TranslationRequest | undefined;

  const removeListener = translator.translation.onEvent((event) => {
    if (currentRequestId.value && event.requestId !== currentRequestId.value) return;
    if (!currentRequestId.value) currentRequestId.value = event.requestId;
    status.value = event.status;
    if (event.status === "streaming" && event.content) resultText.value += event.content;
    if (event.status === "success" && event.content) resultText.value = event.content;
    if (event.status === "success") result.value = event.result;
    if (event.error) errorMessage.value = event.error;
  });

  async function start(request: TranslationRequest): Promise<void> {
    stop();
    const payload = toIpcPayload(request);
    lastRequest = structuredClone(payload);
    currentRequestId.value = undefined;
    resultText.value = "";
    result.value = undefined;
    errorMessage.value = "";
    status.value = "loading";
    try {
      const requestId = await translator.translation.start(payload);
      currentRequestId.value ??= requestId;
    } catch {
      status.value = "error";
      errorMessage.value = "无法启动翻译请求，请重启应用后重试。";
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

  return { status, resultText, result, errorMessage, isRunning, start, stop, retry, reset };
}
