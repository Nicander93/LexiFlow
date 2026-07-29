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
  const warningMessage = ref("");
  const historyId = ref<string>();
  const currentRequestId = ref<string>();
  let lastRequest: TranslationRequest | undefined;

  const removeListener = translator.translation.onEvent((event) => {
    if (currentRequestId.value && event.requestId !== currentRequestId.value) return;
    if (!currentRequestId.value) currentRequestId.value = event.requestId;
    if (event.status !== "success" || status.value !== "success" || !event.warning) {
      status.value = event.status;
    }
    if (event.status === "streaming" && event.content) resultText.value += event.content;
    if (event.status === "streaming" && event.segment) {
      const current = result.value;
      const segments = [...(current?.segments ?? [])];
      const index = segments.findIndex((item) => item.id === event.segment!.id);
      if (index >= 0) segments[index] = event.segment;
      else segments.push(event.segment);
      const targetText = segments.map((item) => item.target).join("\n");
      result.value = {
        requestId: event.requestId,
        sourceText: current?.sourceText ?? lastRequest?.text ?? "",
        originalSourceText: current?.originalSourceText,
        targetText,
        sourceLanguage: current?.sourceLanguage ?? "",
        targetLanguage: current?.targetLanguage ?? lastRequest?.targetLanguage ?? "auto",
        segments,
        modelInfo: current?.modelInfo ?? { provider: "ollama", model: "", durationMs: 0 },
        cleanupActions: current?.cleanupActions,
        createdAt: current?.createdAt ?? Date.now()
      };
      resultText.value = targetText;
    }
    if (event.status === "success" && event.content) resultText.value = event.content;
    if (event.status === "success" && event.result) result.value = event.result;
    if (event.historyId) historyId.value = event.historyId;
    if (event.warning) warningMessage.value = event.warning;
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
    warningMessage.value = "";
    historyId.value = undefined;
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
    warningMessage.value = "";
    historyId.value = undefined;
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
