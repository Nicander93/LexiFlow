import { afterEach, describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => ({
  getSources: vi.fn(),
  primaryDisplay: { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1, id: 1, label: "主屏幕" }
}));

vi.mock("electron", () => ({
  desktopCapturer: { getSources: electronMocks.getSources },
  nativeImage: { createFromBuffer: vi.fn() },
  screen: {
    getAllDisplays: () => [electronMocks.primaryDisplay],
    getPrimaryDisplay: () => electronMocks.primaryDisplay
  }
}));

import { ScreenCaptureService } from "../electron/main/ocr/capture-service";

describe("ScreenCaptureService", () => {
  afterEach(() => {
    vi.useRealTimers();
    electronMocks.getSources.mockReset();
  });

  it("屏幕捕获超时返回结构化 OCR 错误", async () => {
    vi.useFakeTimers();
    electronMocks.getSources.mockImplementation(() => new Promise(() => undefined));
    const pending = new ScreenCaptureService().listScreens();
    const rejection = expect(pending).rejects.toMatchObject({ code: "OCR_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
  });

  it("Electron 返回空缩略图时使用 Windows 系统截屏兜底", async () => {
    const emptyThumbnail = { isEmpty: () => true, getSize: () => ({ width: 0, height: 0 }) };
    electronMocks.getSources.mockResolvedValue([{ id: "screen:0:0", display_id: "", name: "整个屏幕", thumbnail: emptyThumbnail }]);
    const image = {
      isEmpty: () => false,
      getSize: () => ({ width: 1920, height: 1080 }),
      toPNG: () => Buffer.from("captured")
    };
    const fallbackCapture = vi.fn(async () => image as never);

    const result = await new ScreenCaptureService(fallbackCapture).capture();

    expect(fallbackCapture).toHaveBeenCalledWith(electronMocks.primaryDisplay);
    expect(result).toMatchObject({ pixelWidth: 1920, pixelHeight: 1080, scaleFactor: 1 });
    expect(result.imageDataUrl).toBe(`data:image/png;base64,${Buffer.from("captured").toString("base64")}`);
  });
});
