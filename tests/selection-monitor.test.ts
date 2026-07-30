import { describe, expect, it, vi } from "vitest";
import { SelectionMonitor, type GlobalMouseEvent, type GlobalMouseHook } from "../electron/main/selection/monitor";

class FakeMouseHook implements GlobalMouseHook {
  private listeners = new Map<"mousedown" | "mouseup", Set<(event: GlobalMouseEvent) => void>>();

  on(event: "mousedown" | "mouseup", listener: (event: GlobalMouseEvent) => void): void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: "mousedown" | "mouseup", listener: (event: GlobalMouseEvent) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  start(): void {}
  stop(): void {}

  emit(event: "mousedown" | "mouseup", payload: GlobalMouseEvent): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }
}

describe("SelectionMonitor", () => {
  it("开启后在完成有效划词时显示悬浮提示", async () => {
    const hook = new FakeMouseHook();
    const onSelection = vi.fn();
    const monitor = new SelectionMonitor(hook, async () => ({ text: "selected text" }), onSelection);

    monitor.start();
    hook.emit("mousedown", { button: 1, x: 100, y: 100 });
    hook.emit("mouseup", { button: 1, x: 180, y: 100 });
    await vi.waitFor(() => expect(onSelection).toHaveBeenCalledWith("selected text", { x: 180, y: 100 }));
  });

  it("按系统缩放将物理鼠标坐标转换为 Electron 坐标", async () => {
    const hook = new FakeMouseHook();
    const onSelection = vi.fn();
    const monitor = new SelectionMonitor(
      hook,
      async () => ({ text: "selected text" }),
      onSelection,
      undefined,
      (point) => ({ x: point.x / 2, y: point.y / 2 })
    );

    monitor.start();
    hook.emit("mousedown", { button: 1, x: 100, y: 100 });
    hook.emit("mouseup", { button: 1, x: 180, y: 120 });

    await vi.waitFor(() => expect(onSelection).toHaveBeenCalledWith("selected text", { x: 90, y: 60 }));
  });

  it("点击或停用监听时不显示悬浮提示", async () => {
    const hook = new FakeMouseHook();
    const onSelection = vi.fn();
    const monitor = new SelectionMonitor(hook, async () => ({ text: "selected text" }), onSelection);

    monitor.start();
    hook.emit("mousedown", { button: 1, x: 100, y: 100 });
    hook.emit("mouseup", { button: 1, x: 102, y: 101 });
    monitor.stop();
    hook.emit("mousedown", { button: 1, x: 100, y: 100 });
    hook.emit("mouseup", { button: 1, x: 180, y: 100 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onSelection).not.toHaveBeenCalled();
  });
});
