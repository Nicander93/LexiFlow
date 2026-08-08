import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { app } from "electron";
import { unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CaptureScreenResult, OcrBlock, OcrResult, OcrScreen, RecognizeRegionRequest } from "../../shared/types";
import { ScreenCaptureService } from "./capture-service";
import { OcrError } from "./errors";
import { ImageCropper } from "./image-cropper";
import { normalizedToPixels } from "./geometry";

const run = promisify(execFile);
const OCR_SCRIPT = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$file = [Windows.Storage.StorageFile]::GetFileFromPathAsync($args[0]); $file = [System.WindowsRuntimeSystemExtensions]::AsTask($file).GetAwaiter().GetResult()
$stream = $file.OpenAsync([Windows.Storage.FileAccessMode]::Read); $stream = [System.WindowsRuntimeSystemExtensions]::AsTask($stream).GetAwaiter().GetResult()
$decoder = [Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream); $decoder = [System.WindowsRuntimeSystemExtensions]::AsTask($decoder).GetAwaiter().GetResult()
$bitmap = $decoder.GetSoftwareBitmapAsync(); $bitmap = [System.WindowsRuntimeSystemExtensions]::AsTask($bitmap).GetAwaiter().GetResult()
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages(); if ($null -eq $engine) { throw 'OCR_LANGUAGE_PACK_MISSING' }
$result = $engine.RecognizeAsync($bitmap); $result = [System.WindowsRuntimeSystemExtensions]::AsTask($result).GetAwaiter().GetResult()
$lines = @($result.Lines | ForEach-Object {
  $words = @($_.Words)
  $left = ($words | ForEach-Object { [double]$_.BoundingRect.X } | Measure-Object -Minimum).Minimum
  $top = ($words | ForEach-Object { [double]$_.BoundingRect.Y } | Measure-Object -Minimum).Minimum
  $right = ($words | ForEach-Object { [double]$_.BoundingRect.X + [double]$_.BoundingRect.Width } | Measure-Object -Maximum).Maximum
  $bottom = ($words | ForEach-Object { [double]$_.BoundingRect.Y + [double]$_.BoundingRect.Height } | Measure-Object -Maximum).Maximum
  [pscustomobject]@{ text = $_.Text; x = $left; y = $top; width = ($right - $left); height = ($bottom - $top) }
})
[pscustomobject]@{ text = $result.Text; blocks = $lines } | ConvertTo-Json -Compress -Depth 4
`;

interface EngineResult { text: string; blocks: OcrBlock[]; }

class WindowsOcrEngine {
  async recognize(imagePath: string, signal: AbortSignal): Promise<EngineResult> {
    if (process.platform !== "win32") throw new OcrError("OCR_UNSUPPORTED_PLATFORM", "当前平台不支持 Windows OCR。");
    try {
      const { stdout } = await run("powershell.exe", ["-NoProfile", "-Command", OCR_SCRIPT, imagePath], { windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 20_000, signal });
      const value = JSON.parse(stdout) as { text?: string; blocks?: Array<{ text?: string; x?: number; y?: number; width?: number; height?: number }> };
      const blocks = (value.blocks ?? []).filter((block) => typeof block.text === "string" && block.text.trim()).map((block, index) => ({
        id: `ocr-${randomUUID()}-${index + 1}`,
        text: block.text!,
        boundingBox: { x: block.x ?? 0, y: block.y ?? 0, width: block.width ?? 0, height: block.height ?? 0 }
      }));
      return { text: value.text?.trim() || blocks.map((block) => block.text).join("\n"), blocks };
    } catch (error) {
      if (signal.aborted || (error as NodeJS.ErrnoException).code === "ETIMEDOUT") throw new OcrError("OCR_TIMEOUT", "OCR 识别已取消或超时。");
      const message = `${(error as Error).message ?? error}`;
      if (message.includes("OCR_LANGUAGE_PACK_MISSING") || message.includes("language pack")) throw new OcrError("OCR_LANGUAGE_PACK_MISSING", "Windows OCR 语言包不可用。");
      throw new OcrError("OCR_ENGINE_FAILED", "Windows OCR 引擎执行失败。");
    }
  }
}

/** Two-stage OCR facade kept as the IPC-facing boundary. */
export class WindowsOcrService {
  private readonly captureService = new ScreenCaptureService();
  private readonly cropper = new ImageCropper();
  private readonly engine = new WindowsOcrEngine();
  private readonly controllers = new Map<string, AbortController>();

  listScreens(): Promise<OcrScreen[]> { return this.captureService.listScreens(); }
  captureScreen(screenId?: string): Promise<CaptureScreenResult> { return this.captureService.capture(screenId); }

  async recognizeRegion(request: RecognizeRegionRequest): Promise<OcrResult> {
    const captured = this.captureService.get(request.captureId);
    if (!captured) throw new OcrError("OCR_CAPTURE_FAILED", "截图已过期，请重新截图。");
    const region = normalizedToPixels(request.region, captured.pixelWidth, captured.pixelHeight);
    if (region.width < 2 || region.height < 2) {
      this.captureService.release(request.captureId);
      throw new OcrError("OCR_EMPTY_REGION", "请选择更大的文本区域。");
    }
    const controller = new AbortController();
    this.controllers.set(request.captureId, controller);
    const temporaryPath = join(app.getPath("temp"), `lexiflow-ocr-region-${randomUUID()}.png`);
    try {
      const cropped = await this.cropper.crop(captured.image.toPNG(), region);
      await writeFile(temporaryPath, cropped);
      const recognized = await this.engine.recognize(temporaryPath, controller.signal);
      const blocks = recognized.blocks.map((block) => ({ ...block, boundingBox: { ...block.boundingBox, x: block.boundingBox.x + region.x, y: block.boundingBox.y + region.y } }));
      return {
        captureId: request.captureId,
        text: recognized.text,
        blocks,
        imageDataUrl: `data:image/png;base64,${captured.image.toPNG().toString("base64")}`,
        imageWidth: captured.pixelWidth,
        imageHeight: captured.pixelHeight
      };
    } finally {
      this.controllers.delete(request.captureId);
      this.captureService.release(request.captureId);
      await unlink(temporaryPath).catch(() => undefined);
    }
  }

  cancel(captureId: string): void {
    this.controllers.get(captureId)?.abort();
    this.captureService.release(captureId);
  }
}

