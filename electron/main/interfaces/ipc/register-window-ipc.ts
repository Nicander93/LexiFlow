import { IPC_CHANNELS } from "../../../shared/types";
import { parseBoolean, parseRoute, parseString } from "../../ipc/validation";
import { registerOn } from "./helpers";
import type { IpcDependencies } from "./types";

export function registerWindowIpc(dependencies: IpcDependencies): void {
  const { windowManager, translationManager } = dependencies;
  registerOn(IPC_CHANNELS.clipboardWrite, (_event, text: string) => dependencies.clipboardWrite(parseString(text, "剪贴板内容", 100_000)));
  registerOn(IPC_CHANNELS.windowOpenMain, (_event, route?: string) => {
    void (async () => {
      const mainWindow = await windowManager.showMainWindow(parseRoute(route));
      translationManager.pushActiveSession(mainWindow.webContents);
      if (!windowManager.isPopupPinned()) {
        translationManager.cancelLane("popup-translation");
        windowManager.hidePopup();
      }
    })();
  });
  registerOn(IPC_CHANNELS.popupClose, () => {
    translationManager.cancelLane("popup-translation");
    windowManager.hidePopup();
  });
  registerOn(IPC_CHANNELS.popupPin, (_event, pinned: boolean) => windowManager.setPopupPinned(parseBoolean(pinned, "固定状态")));
  registerOn(IPC_CHANNELS.popupAdaptHeight, (_event, kind?: string, contentHeight?: unknown) => {
    if (kind !== undefined && !["dictionary", "translation", "naming", "default"].includes(kind)) throw new Error("弹窗视图类型无效。");
    if (contentHeight !== undefined && (typeof contentHeight !== "number" || !Number.isFinite(contentHeight))) throw new Error("弹窗内容高度无效。");
    windowManager.adaptPopupHeight((kind as "dictionary" | "translation" | "naming" | "default" | undefined) ?? "default", contentHeight as number | undefined);
  });
}
