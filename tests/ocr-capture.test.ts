import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  desktopCapturer: { getSources: vi.fn(() => new Promise(() => undefined)) },
  screen: {
    getAllDisplays: () => [{ bounds: { width: 1920, height: 1080 }, scaleFactor: 1, id: 1 }],
    getPrimaryDisplay: () => ({ bounds: { x: 0, y: 0 }, id: 1 })
  }
}));

import { ScreenCaptureService } from "../electron/main/ocr/capture-service";

describe("ScreenCaptureService", () => {
  afterEach(() => vi.useRealTimers());

  it("屏幕捕获超时返回结构化 OCR 错误", async () => {
    vi.useFakeTimers();
    const pending = new ScreenCaptureService().listScreens();
    const rejection = expect(pending).rejects.toMatchObject({ code: "OCR_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
  });
});
