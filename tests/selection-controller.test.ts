import { describe, expect, it, vi } from "vitest";
import { SelectionController } from "../electron/main/selection/controller";
import type { GlobalMouseEvent, GlobalMouseHook } from "../electron/main/selection/monitor";

class FakeMouseHook implements GlobalMouseHook {
  private listeners = new Map<"mousedown" | "mouseup", Set<(event: GlobalMouseEvent) => void>>();
  start = vi.fn();
  stop = vi.fn();

  on(event: "mousedown" | "mouseup", listener: (event: GlobalMouseEvent) => void): void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: "mousedown" | "mouseup", listener: (event: GlobalMouseEvent) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: "mousedown" | "mouseup", payload: GlobalMouseEvent): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }
}

describe("SelectionController", () => {
  it("集中管理监听、提示和确认翻译", async () => {
    const hook = new FakeMouseHook();
    const showTip = vi.fn();
    const hideTip = vi.fn();
    const onConfirm = vi.fn();
    const controller = new SelectionController({
      hook,
      capture: async () => ({ text: "selected" }),
      normalizePoint: (point) => point,
      showTip,
      hideTip,
      isTipPoint: () => false,
      onConfirm
    });

    controller.setEnabled(true);
    hook.emit("mousedown", { button: 1, x: 10, y: 10 });
    hook.emit("mouseup", { button: 1, x: 80, y: 10 });
    await vi.waitFor(() => expect(showTip).toHaveBeenCalledWith({ x: 80, y: 10 }));

    controller.confirm();
    expect(onConfirm).toHaveBeenCalledWith("selected");
    expect(hideTip).toHaveBeenCalled();

    controller.setEnabled(false);
    expect(hook.stop).toHaveBeenCalled();
  });
});
