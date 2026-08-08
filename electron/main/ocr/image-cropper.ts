import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { PixelRegion } from "./geometry";
import { OcrError } from "./errors";

export class ImageCropper {
  async crop(imageData: Buffer, region: PixelRegion): Promise<Buffer> {
    if (region.width < 2 || region.height < 2) throw new OcrError("OCR_EMPTY_REGION", "选区过小，无法识别。");
    const image = await loadImage(imageData);
    if (region.x < 0 || region.y < 0 || region.x + region.width > image.width || region.y + region.height > image.height) throw new OcrError("OCR_EMPTY_REGION", "选区超出截图范围。");
    const canvas = createCanvas(region.width, region.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, -region.x, -region.y);
    return canvas.toBuffer("image/png");
  }
}

