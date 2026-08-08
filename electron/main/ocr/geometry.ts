import type { OcrBlock } from "../../shared/types";

export interface NormalizedRegion { x: number; y: number; width: number; height: number; }
export interface PixelRegion { x: number; y: number; width: number; height: number; }

export function normalizeRegion(region: NormalizedRegion): NormalizedRegion {
  const left = Math.max(0, Math.min(1, Math.min(region.x, region.x + region.width)));
  const top = Math.max(0, Math.min(1, Math.min(region.y, region.y + region.height)));
  const right = Math.max(0, Math.min(1, Math.max(region.x, region.x + region.width)));
  const bottom = Math.max(0, Math.min(1, Math.max(region.y, region.y + region.height)));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function normalizedToPixels(region: NormalizedRegion, pixelWidth: number, pixelHeight: number): PixelRegion {
  const normalized = normalizeRegion(region);
  const x = Math.floor(normalized.x * pixelWidth);
  const y = Math.floor(normalized.y * pixelHeight);
  const right = Math.ceil((normalized.x + normalized.width) * pixelWidth);
  const bottom = Math.ceil((normalized.y + normalized.height) * pixelHeight);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

export function blockIntersectsRegion(block: OcrBlock, region: PixelRegion): boolean {
  const box = block.boundingBox;
  return box.x < region.x + region.width && box.x + box.width > region.x && box.y < region.y + region.height && box.y + box.height > region.y;
}

