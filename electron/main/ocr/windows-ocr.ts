/**
 * Windows OCR 第一阶段：desktopCapturer 取屏缩略图 → 临时 PNG → PowerShell OcrEngine → 返回文本块。
 * 临时文件在 finally 中删除；不持久化原图。非 win32 直接拒绝。无原生跨屏框选。
 */
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, desktopCapturer, screen } from "electron";
import type { OcrBlock, OcrResult, OcrScreen } from "../../shared/types";

const run = promisify(execFile);
const SCRIPT = `Add-Type -AssemblyName System.Runtime.WindowsRuntime
$file = [Windows.Storage.StorageFile]::GetFileFromPathAsync($args[0]); $file = [System.WindowsRuntimeSystemExtensions]::AsTask($file).GetAwaiter().GetResult()
$stream = $file.OpenAsync([Windows.Storage.FileAccessMode]::Read); $stream = [System.WindowsRuntimeSystemExtensions]::AsTask($stream).GetAwaiter().GetResult()
$decoder = [Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream); $decoder = [System.WindowsRuntimeSystemExtensions]::AsTask($decoder).GetAwaiter().GetResult()
$bitmap = $decoder.GetSoftwareBitmapAsync(); $bitmap = [System.WindowsRuntimeSystemExtensions]::AsTask($bitmap).GetAwaiter().GetResult()
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages(); if ($null -eq $engine) { throw 'Windows OCR language pack is unavailable.' }
$result = $engine.RecognizeAsync($bitmap); $result = [System.WindowsRuntimeSystemExtensions]::AsTask($result).GetAwaiter().GetResult()
[pscustomobject]@{ text = $result.Text; blocks = @($result.Lines | ForEach-Object { [pscustomobject]@{ text = $_.Text; x = $_.Words[0].BoundingRect.X; y = $_.Words[0].BoundingRect.Y; width = ($_.Words | Measure-Object -Property BoundingRect.Width -Sum).Sum; height = $_.Words[0].BoundingRect.Height } }) } | ConvertTo-Json -Compress -Depth 4`;

export class WindowsOcrService {
  private async sources() {
    return desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1920, height: 1080 } });
  }

  async listScreens(): Promise<OcrScreen[]> {
    if (process.platform !== "win32") return [];
    const primaryDisplayId = String(screen.getPrimaryDisplay().id);
    return (await this.sources()).map((source) => {
      const size = source.thumbnail.getSize();
      return { id: source.id, name: source.name || source.id, width: size.width, height: size.height, primary: source.id.split(":")[1] === primaryDisplayId };
    });
  }

  async captureScreen(screenId?: string): Promise<OcrResult> {
    if (process.platform !== "win32") throw new Error("当前平台不支持 Windows OCR。 ");
    const sources = await this.sources();
    const primaryDisplayId = String(screen.getPrimaryDisplay().id);
    const source = (screenId ? sources.find((candidate) => candidate.id === screenId) : undefined) ?? sources.find((candidate) => candidate.id.split(":")[1] === primaryDisplayId) ?? sources[0];
    if (!source || source.thumbnail.isEmpty()) throw new Error("无法捕获屏幕内容。 ");
    const path = join(app.getPath("temp"), `lexiflow-ocr-${randomUUID()}.png`);
    await writeFile(path, source.thumbnail.toPNG());
    try {
      const { stdout } = await run("powershell.exe", ["-NoProfile", "-Command", SCRIPT, path], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
      const value = JSON.parse(stdout) as { text?: string; blocks?: Array<{ text?: string; x?: number; y?: number; width?: number; height?: number }> };
      const blocks: OcrBlock[] = (value.blocks ?? []).filter((block) => block.text).map((block, index) => ({ id: `ocr-${index + 1}`, text: block.text!, boundingBox: { x: block.x ?? 0, y: block.y ?? 0, width: block.width ?? 0, height: block.height ?? 0 } }));
      const imageSize = source.thumbnail.getSize();
      return { text: value.text ?? blocks.map((block) => block.text).join("\n"), blocks, imageDataUrl: `data:image/png;base64,${source.thumbnail.toPNG().toString("base64")}`, imageWidth: imageSize.width, imageHeight: imageSize.height };
    } finally { await unlink(path).catch(() => undefined); }
  }
}
