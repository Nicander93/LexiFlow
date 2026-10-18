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
  it("拖选只显示提示，确认后才读取并提交选区", async () => {
    const hook = new FakeMouseHook();
    const capture = vi.fn(async () => ({ text: "selected" }));
    const showTip = vi.fn();
    const hideTip = vi.fn();
    const onConfirm = vi.fn();
    const controller = new SelectionController({
      hook,
      capture,
      normalizePoint: (point) => point,
      showTip,
      hideTip,
      isTipPoint: () => false,
      onConfirm
    });

    controller.setEnabled(true);
    hook.emit("mousedown", { button: 1, x: 10, y: 10 });
    hook.emit("mouseup", { button: 1, x: 80, y: 10 });
    expect(showTip).toHaveBeenCalledWith({ x: 80, y: 10 });
    expect(capture).not.toHaveBeenCalled();

    controller.confirm();
    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ text: "selected" }));
    expect(capture).toHaveBeenCalledTimes(1);
    expect(hideTip).toHaveBeenCalled();

    controller.setEnabled(false);
    expect(hook.stop).toHaveBeenCalled();
  });

  it("合并重复确认，避免并发读取选区", async () => {
    const hook = new FakeMouseHook();
    let resolveCapture!: (result: { text: string }) => void;
    const capture = vi.fn(() => new Promise<{ text: string }>((resolve) => { resolveCapture = resolve; }));
    const onConfirm = vi.fn();
    const controller = new SelectionController({
      hook,
      capture,
      normalizePoint: (point) => point,
      showTip: vi.fn(),
      hideTip: vi.fn(),
      isTipPoint: () => false,
      onConfirm
    });

    controller.setEnabled(true);
    hook.emit("mousedown", { button: 1, x: 10, y: 10 });
    hook.emit("mouseup", { button: 1, x: 80, y: 10 });
    controller.confirm();
    controller.confirm();

    expect(capture).toHaveBeenCalledTimes(1);
    resolveCapture({ text: "selected" });
    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it("丢弃捕获期间被取消的旧选区结果", async () => {
    const hook = new FakeMouseHook();
    let resolveCapture!: (result: { text: string }) => void;
    const onConfirm = vi.fn();
    const controller = new SelectionController({
      hook,
      capture: () => new Promise((resolve) => { resolveCapture = resolve; }),
      normalizePoint: (point) => point,
      showTip: vi.fn(),
      hideTip: vi.fn(),
      isTipPoint: () => false,
      onConfirm
    });

    controller.setEnabled(true);
    hook.emit("mousedown", { button: 1, x: 10, y: 10 });
    hook.emit("mouseup", { button: 1, x: 80, y: 10 });
    controller.confirm();
    controller.dismiss();
    resolveCapture({ text: "stale" });
    await Promise.resolve();

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("提示超时后不再读取旧选区", () => {
    vi.useFakeTimers();
    try {
      const hook = new FakeMouseHook();
      const capture = vi.fn(async () => ({ text: "stale" }));
      const controller = new SelectionController({
        hook,
        capture,
        normalizePoint: (point) => point,
        showTip: vi.fn(),
        hideTip: vi.fn(),
        isTipPoint: () => false,
        onConfirm: vi.fn(),
        tipDurationMs: 5_000
      });

      controller.setEnabled(true);
      hook.emit("mousedown", { button: 1, x: 10, y: 10 });
      hook.emit("mouseup", { button: 1, x: 80, y: 10 });
      vi.advanceTimersByTime(5_000);
      controller.confirm();

      expect(capture).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
