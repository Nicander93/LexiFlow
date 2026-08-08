import { describe, expect, it } from "vitest";
import { blockIntersectsRegion, normalizedToPixels } from "../electron/main/ocr/geometry";

describe("OCR 归一化坐标", () => {
  it("按实际捕获像素换算并裁剪越界选区", () => {
    expect(normalizedToPixels({ x: 0.25, y: 0.1, width: 0.5, height: 0.4 }, 4000, 2000)).toEqual({ x: 1000, y: 200, width: 2000, height: 800 });
    expect(normalizedToPixels({ x: 0.9, y: 0.9, width: 0.5, height: 0.5 }, 1000, 1000)).toEqual({ x: 900, y: 900, width: 100, height: 100 });
  });

  it("按矩形相交而非中心点筛选文本块", () => {
    expect(blockIntersectsRegion({ id: "a", text: "a", boundingBox: { x: 90, y: 20, width: 30, height: 20 } }, { x: 100, y: 20, width: 10, height: 20 })).toBe(true);
  });
});

