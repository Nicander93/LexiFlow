import { computed, onMounted, onUnmounted, ref, type Ref } from "vue";
import type { OcrResult, OcrScreen } from "../../../electron/shared/types";
import { getTranslatorApi } from "../../platform/translator";

export function useOcrCapture(options: {
  sourceText: Ref<string>;
  onRecognized?: (text: string) => void;
  onError?: (error: string) => void;
}) {
  const translator = getTranslatorApi();
  const ocrResult = ref<OcrResult>();
  const ocrLoading = ref(false);
  const ocrError = ref("");
  const ocrScreens = ref<OcrScreen[]>([]);
  const ocrScreenId = ref<string>();
  const ocrImage = ref<HTMLElement>();
  const ocrSelection = ref<{ startX: number; startY: number; endX: number; endY: number }>();
  const selectingOcr = ref(false);
  let captureSequence = 0;

  async function captureOcr(): Promise<void> {
    if (ocrLoading.value) return;
    const sequence = ++captureSequence;
    ocrLoading.value = true;
    ocrError.value = "";
    try {
      if (ocrResult.value?.captureId) translator.ocr.cancel(ocrResult.value.captureId);
      const captured = await translator.ocr.captureScreen({ screenId: ocrScreenId.value, excludeMainWindow: true });
      if (sequence !== captureSequence) { translator.ocr.cancel(captured.captureId); return; }
      ocrResult.value = {
        captureId: captured.captureId,
        text: "",
        blocks: [],
        imageDataUrl: captured.imageDataUrl,
        imageWidth: captured.pixelWidth,
        imageHeight: captured.pixelHeight
      };
    } catch (error) {
      if (sequence !== captureSequence) return;
      ocrError.value = error instanceof Error ? error.message : "OCR 识别失败。";
      options.onError?.(ocrError.value);
    } finally {
      if (sequence === captureSequence) ocrLoading.value = false;
    }
  }

  function pointInOcrImage(event: PointerEvent): { x: number; y: number } | undefined {
    const bounds = ocrImage.value?.getBoundingClientRect();
    if (!bounds || !bounds.width || !bounds.height) return undefined;
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
    };
  }

  function beginOcrSelection(event: PointerEvent): void {
    const point = pointInOcrImage(event);
    if (!point) return;
    selectingOcr.value = true;
    ocrSelection.value = { startX: point.x, startY: point.y, endX: point.x, endY: point.y };
    ocrImage.value?.setPointerCapture(event.pointerId);
  }

  function moveOcrSelection(event: PointerEvent): void {
    if (!selectingOcr.value || !ocrSelection.value) return;
    const point = pointInOcrImage(event);
    if (point) {
      ocrSelection.value.endX = point.x;
      ocrSelection.value.endY = point.y;
    }
  }

  function endOcrSelection(event: PointerEvent): void {
    if (!selectingOcr.value || !ocrSelection.value || !ocrResult.value) return;
    selectingOcr.value = false;
    const point = pointInOcrImage(event);
    if (point) {
      ocrSelection.value.endX = point.x;
      ocrSelection.value.endY = point.y;
    }
    const selection = ocrSelection.value;
    if (Math.abs(selection.endX - selection.startX) < 0.01 || Math.abs(selection.endY - selection.startY) < 0.01) {
      ocrSelection.value = undefined;
      return;
    }
    void recognizeSelection(selection);
  }

  function cancelOcrSelection(): void {
    selectingOcr.value = false;
    ocrSelection.value = undefined;
  }

  async function recognizeSelection(selection: { startX: number; startY: number; endX: number; endY: number }): Promise<void> {
    const captureId = ocrResult.value?.captureId;
    if (!captureId || ocrLoading.value) return;
    const sequence = ++captureSequence;
    ocrLoading.value = true;
    ocrError.value = "";
    try {
      const recognized = await translator.ocr.recognizeRegion({
        captureId,
        region: {
          x: Math.min(selection.startX, selection.endX),
          y: Math.min(selection.startY, selection.endY),
          width: Math.abs(selection.endX - selection.startX),
          height: Math.abs(selection.endY - selection.startY)
        }
      });
      if (sequence !== captureSequence) return;
      ocrResult.value = recognized;
      if (recognized.text) {
        options.sourceText.value = recognized.text;
        options.onRecognized?.(recognized.text);
      } else {
        ocrError.value = "未识别到文字，请重新截图并框选更清晰的区域。";
        options.onError?.(ocrError.value);
      }
    } catch (error) {
      if (sequence !== captureSequence) return;
      ocrError.value = error instanceof Error ? error.message : "OCR 识别失败。";
      options.onError?.(ocrError.value);
    } finally {
      if (sequence === captureSequence) ocrLoading.value = false;
    }
  }

  function resetOcr(): void {
    captureSequence += 1;
    if (ocrResult.value?.captureId) translator.ocr.cancel(ocrResult.value.captureId);
    ocrResult.value = undefined;
    ocrSelection.value = undefined;
    ocrError.value = "";
    ocrLoading.value = false;
    selectingOcr.value = false;
  }

  const ocrSelectionStyle = computed(() => {
    const value = ocrSelection.value;
    if (!value) return undefined;
    const left = Math.min(value.startX, value.endX);
    const top = Math.min(value.startY, value.endY);
    return {
      left: `${left * 100}%`,
      top: `${top * 100}%`,
      width: `${Math.abs(value.endX - value.startX) * 100}%`,
      height: `${Math.abs(value.endY - value.startY) * 100}%`
    };
  });

  const handleSidebarCapture = (): void => { void captureOcr(); };
  onMounted(async () => {
    try {
      ocrScreens.value = await translator.ocr.listScreens();
      ocrScreenId.value = ocrScreens.value.find((item) => item.primary)?.id ?? ocrScreens.value[0]?.id;
    } catch {
      ocrScreens.value = [];
    }
    window.addEventListener("lexiflow:ocr-capture", handleSidebarCapture);
  });
  onUnmounted(() => {
    window.removeEventListener("lexiflow:ocr-capture", handleSidebarCapture);
    resetOcr();
  });

  return {
    ocrResult,
    ocrLoading,
    ocrError,
    ocrScreens,
    ocrScreenId,
    ocrImage,
    ocrSelection,
    selectingOcr,
    ocrSelectionStyle,
    captureOcr,
    beginOcrSelection,
    moveOcrSelection,
    endOcrSelection,
    cancelOcrSelection,
    setOcrImage: (element?: HTMLElement) => { ocrImage.value = element; },
    resetOcr
  };
}
