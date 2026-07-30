import { uIOhook, type UiohookMouseEvent } from "uiohook-napi";
import type { GlobalMouseHook } from "./monitor";

/**
 * 将 uiohook-napi 的重载事件接口收敛为划词模块需要的两个鼠标事件。
 */
export function createGlobalMouseHook(): GlobalMouseHook {
  return {
    on(event, listener) {
      const typedListener = listener as (mouseEvent: UiohookMouseEvent) => void;
      if (event === "mousedown") uIOhook.on("mousedown", typedListener);
      else uIOhook.on("mouseup", typedListener);
    },
    off(event, listener) {
      const typedListener = listener as (mouseEvent: UiohookMouseEvent) => void;
      if (event === "mousedown") uIOhook.off("mousedown", typedListener);
      else uIOhook.off("mouseup", typedListener);
    },
    start: () => uIOhook.start(),
    stop: () => uIOhook.stop()
  };
}
