import { IPC_CHANNELS } from "../../../shared/types";
import { parseId, parseOcrRegion } from "../../ipc/validation";
import { registerInvoke, registerOn } from "./helpers";
import type { IpcDependencies } from "./types";

export function registerOcrIpc(dependencies: IpcDependencies): void {
  const { ocrService, windowManager } = dependencies;
  registerInvoke(IPC_CHANNELS.ocrListScreens, () => ocrService.listScreens());
  registerInvoke(IPC_CHANNELS.ocrCaptureScreen, (_event, options?: unknown) => {
    if (options !== undefined && (!options || typeof options !== "object" || Array.isArray(options))) {
      throw new Error("OCR 截图参数无效。");
    }
    const value = options as { screenId?: unknown; excludeMainWindow?: unknown } | undefined;
    const screenId = value?.screenId === undefined ? undefined : parseId(value.screenId, "屏幕 ID");
    if (value?.excludeMainWindow !== undefined && typeof value.excludeMainWindow !== "boolean") {
      throw new Error("OCR 截图窗口参数无效。");
    }
    const capture = () => ocrService.captureScreen(screenId);
    return value?.excludeMainWindow ? windowManager.withMainWindowHiddenForCapture(capture) : capture();
  });
  registerInvoke(IPC_CHANNELS.ocrRecognizeRegion, (_event, request: unknown) => ocrService.recognizeRegion(parseOcrRegion(request)));
  registerOn(IPC_CHANNELS.ocrCancel, (_event, captureId: string) => ocrService.cancel(parseId(captureId, "截图 ID")));
}
