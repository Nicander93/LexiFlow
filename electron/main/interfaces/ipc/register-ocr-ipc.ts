import { IPC_CHANNELS } from "../../../shared/types";
import { parseId, parseOcrRegion } from "../../ipc/validation";
import { registerInvoke, registerOn } from "./helpers";
import type { IpcDependencies } from "./types";

export function registerOcrIpc(dependencies: IpcDependencies): void {
  const { ocrService } = dependencies;
  registerInvoke(IPC_CHANNELS.ocrListScreens, () => ocrService.listScreens());
  registerInvoke(IPC_CHANNELS.ocrCaptureScreen, (_event, screenId?: string) => {
    if (screenId !== undefined) parseId(screenId, "屏幕 ID");
    return ocrService.captureScreen(screenId);
  });
  registerInvoke(IPC_CHANNELS.ocrRecognizeRegion, (_event, request: unknown) => ocrService.recognizeRegion(parseOcrRegion(request)));
  registerOn(IPC_CHANNELS.ocrCancel, (_event, captureId: string) => ocrService.cancel(parseId(captureId, "截图 ID")));
}
