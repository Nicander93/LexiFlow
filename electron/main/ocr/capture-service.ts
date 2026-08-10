import { randomUUID } from "node:crypto";
import { desktopCapturer, nativeImage, screen, type Display, type NativeImage } from "electron";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { CaptureScreenResult, OcrScreen } from "../../shared/types";
import { OcrError } from "./errors";

const run = promisify(execFile);
const FALLBACK_CAPTURE_SCRIPT = `
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class LexiFlowDpi {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
[LexiFlowDpi]::SetProcessDPIAware() | Out-Null
$bitmap = New-Object System.Drawing.Bitmap([int]$env:LEXIFLOW_CAPTURE_WIDTH, [int]$env:LEXIFLOW_CAPTURE_HEIGHT, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.CopyFromScreen([int]$env:LEXIFLOW_CAPTURE_X, [int]$env:LEXIFLOW_CAPTURE_Y, 0, 0, $bitmap.Size, [System.Drawing.CopyPixelOperation]::SourceCopy)
  $bitmap.Save($env:LEXIFLOW_CAPTURE_PATH, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}
`;

type DisplayCapture = (display: Display) => Promise<NativeImage>;

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

  constructor(private readonly fallbackCapture: DisplayCapture = captureDisplayWithWindowsGdi) {}

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
    const displays = screen.getAllDisplays();
    const primaryDisplay = screen.getPrimaryDisplay();
    const sources = await this.sources();
    const usableSources = sources.filter((source) => !source.thumbnail.isEmpty());
    if (!usableSources.length) {
      return displays.map((display, index) => ({
        id: `display:${display.id}`,
        name: display.label || `屏幕 ${index + 1}`,
        width: Math.round(display.bounds.width * display.scaleFactor),
        height: Math.round(display.bounds.height * display.scaleFactor),
        primary: display.id === primaryDisplay.id
      }));
    }
    const primary = String(primaryDisplay.id);
    return usableSources.map((source) => {
      const size = source.thumbnail.getSize();
      const display = displays.find((item) => source.display_id === String(item.id) || source.id.includes(String(item.id)));
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
    const source = (screenId ? sources.find((item) => item.id === screenId && !item.thumbnail.isEmpty()) : undefined)
      ?? sources.find((item) => item.id.includes(primary))
      ?? sources.find((item) => !item.thumbnail.isEmpty());
    const requestedDisplayId = screenId?.startsWith("display:") ? screenId.slice("display:".length) : undefined;
    const displays = screen.getAllDisplays();
    const display = displays.find((item) => String(item.id) === requestedDisplayId)
      ?? displays.find((item) => source?.display_id === String(item.id) || source?.id.includes(String(item.id)))
      ?? screen.getPrimaryDisplay();
    const image = source && !source.thumbnail.isEmpty()
      ? source.thumbnail
      : await this.fallbackCapture(display).catch(() => {
          throw new OcrError("OCR_CAPTURE_FAILED", "无法捕获屏幕内容。 ");
        });
    if (image.isEmpty()) throw new OcrError("OCR_CAPTURE_FAILED", "无法捕获屏幕内容。 ");
    const size = image.getSize();
    const scaleFactor = display?.scaleFactor ?? 1;
    const captureId = randomUUID();
    const captured = { captureId, image, pixelWidth: size.width, pixelHeight: size.height, scaleFactor, screenId: source?.id ?? `display:${display.id}`, createdAt: Date.now() } satisfies CapturedScreen;
    this.captures.set(captureId, captured);
    return { captureId, imageDataUrl: `data:image/png;base64,${image.toPNG().toString("base64")}`, pixelWidth: size.width, pixelHeight: size.height, scaleFactor };
  }

  get(captureId: string): CapturedScreen | undefined { return this.captures.get(captureId); }
  release(captureId: string): void { this.captures.delete(captureId); }
  clear(): void { this.captures.clear(); }
  cleanupExpired(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, capture] of this.captures) if (capture.createdAt < cutoff) this.captures.delete(id);
  }
}

function displayPixelBounds(display: Display): { x: number; y: number; width: number; height: number } {
  const bounds = display.bounds;
  const convert = (point: { x: number; y: number }) => typeof screen.dipToScreenPoint === "function"
    ? screen.dipToScreenPoint(point)
    : { x: Math.round(point.x * display.scaleFactor), y: Math.round(point.y * display.scaleFactor) };
  const topLeft = convert({ x: bounds.x, y: bounds.y });
  const bottomRight = convert({ x: bounds.x + bounds.width, y: bounds.y + bounds.height });
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: Math.max(1, bottomRight.x - topLeft.x),
    height: Math.max(1, bottomRight.y - topLeft.y)
  };
}

async function captureDisplayWithWindowsGdi(display: Display): Promise<NativeImage> {
  const directory = await mkdtemp(join(tmpdir(), "lexiflow-screen-capture-"));
  const imagePath = join(directory, "screen.png");
  const bounds = displayPixelBounds(display);
  try {
    await run("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-WindowStyle",
      "Hidden",
      "-Command",
      FALLBACK_CAPTURE_SCRIPT
    ], {
      windowsHide: true,
      timeout: 12_000,
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        LEXIFLOW_CAPTURE_PATH: imagePath,
        LEXIFLOW_CAPTURE_X: String(bounds.x),
        LEXIFLOW_CAPTURE_Y: String(bounds.y),
        LEXIFLOW_CAPTURE_WIDTH: String(bounds.width),
        LEXIFLOW_CAPTURE_HEIGHT: String(bounds.height)
      }
    });
    return nativeImage.createFromBuffer(await readFile(imagePath));
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}
