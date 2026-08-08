import { afterEach, describe, expect, it, vi } from "vitest";
import { PopupBoundsPersistence } from "../electron/main/window/popup-bounds-persistence";

describe("PopupBoundsPersistence", () => {
  afterEach(() => vi.useRealTimers());

  it("100 个流式布局调整不会写入设置", () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const persistence = new PopupBoundsPersistence(save, 300);
    for (let index = 0; index < 100; index += 1) {
      persistence.beginProgrammaticResize();
      persistence.resized(() => ({ width: 420, height: 300 + index }));
    }
    vi.advanceTimersByTime(1_000);
    expect(save).not.toHaveBeenCalled();
    persistence.dispose();
  });

  it("用户拖动尺寸只保存最后一次", () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const persistence = new PopupBoundsPersistence(save, 300);
    persistence.resized(() => ({ width: 500, height: 400 }));
    persistence.resized(() => ({ width: 600, height: 450 }));
    vi.advanceTimersByTime(299);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith({ width: 600, height: 450 });
    persistence.dispose();
  });
});

