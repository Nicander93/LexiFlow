import { randomUUID } from "node:crypto";
import { desktopCapturer, screen, type NativeImage } from "electron";
import type { CaptureScreenResult, OcrScreen } from "../../shared/types";
import { OcrError } from "./errors";

export interface CapturedScreen {
  captureId: string;
  image: NativeImage;
  pixelWidth: number;
  pixelHeight: number;
  scaleFactor: number;
  screenId: string;
  createdAt: number;
}

export class ScreenCaptureService {
  private readonly captures = new Map<string, CapturedScreen>();
  private readonly ttlMs = 60_000;
  private readonly captureTimeoutMs = 15_000;

  private async sources() {
    const displays = screen.getAllDisplays();
    const width = Math.max(...displays.map((item) => Math.ceil(item.bounds.width * item.scaleFactor)), 1920);
    const height = Math.max(...displays.map((item) => Math.ceil(item.bounds.height * item.scaleFactor)), 1080);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width, height } }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new OcrError("OCR_TIMEOUT", "屏幕捕获超时，请重试。")), this.captureTimeoutMs);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async listScreens(): Promise<OcrScreen[]> {
    if (process.platform !== "win32") return [];
    const primary = String(screen.getPrimaryDisplay().id);
    return (await this.sources()).map((source) => {
      const size = source.thumbnail.getSize();
      const display = screen.getAllDisplays().find((item) => source.id.includes(String(item.id)));
      return { id: source.id, name: source.name || source.id, width: size.width, height: size.height, primary: source.id.includes(primary) || display?.bounds.x === screen.getPrimaryDisplay().bounds.x };
    });
  }

  async capture(screenId?: string): Promise<CaptureScreenResult> {
    if (process.platform !== "win32") throw new OcrError("OCR_UNSUPPORTED_PLATFORM", "当前平台不支持 Windows OCR。 ");
    this.cleanupExpired();
    const sources = await this.sources().catch((error: unknown) => {
      if (error instanceof OcrError) throw error;
      throw new OcrError("OCR_CAPTURE_FAILED", "无法列出屏幕内容。 ");
    });
    const primary = String(screen.getPrimaryDisplay().id);
    const source = (screenId ? sources.find((item) => item.id === screenId) : undefined)
      ?? sources.find((item) => item.id.includes(primary))
      ?? sources[0];
    if (!source || source.thumbnail.isEmpty()) throw new OcrError("OCR_CAPTURE_FAILED", "无法捕获屏幕内容。 ");
    const size = source.thumbnail.getSize();
    const display = screen.getAllDisplays().find((item) => source.id.includes(String(item.id)));
    const scaleFactor = display?.scaleFactor ?? 1;
    const captureId = randomUUID();
    const captured = { captureId, image: source.thumbnail, pixelWidth: size.width, pixelHeight: size.height, scaleFactor, screenId: source.id, createdAt: Date.now() } satisfies CapturedScreen;
    this.captures.set(captureId, captured);
    return { captureId, imageDataUrl: `data:image/png;base64,${source.thumbnail.toPNG().toString("base64")}`, pixelWidth: size.width, pixelHeight: size.height, scaleFactor };
  }

  get(captureId: string): CapturedScreen | undefined { return this.captures.get(captureId); }
  release(captureId: string): void { this.captures.delete(captureId); }
  clear(): void { this.captures.clear(); }
  cleanupExpired(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, capture] of this.captures) if (capture.createdAt < cutoff) this.captures.delete(id);
  }
}
