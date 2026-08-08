export interface OcrBlock { id: string; text: string; boundingBox: { x: number; y: number; width: number; height: number }; confidence?: number; }
export interface OcrResult { text: string; blocks: OcrBlock[]; imageDataUrl: string; imageWidth: number; imageHeight: number; captureId?: string; }
export interface OcrScreen { id: string; name: string; width: number; height: number; primary: boolean; }
export interface CaptureScreenResult { captureId: string; imageDataUrl: string; pixelWidth: number; pixelHeight: number; scaleFactor: number; }
export interface RecognizeRegionRequest { captureId: string; region: { x: number; y: number; width: number; height: number }; }
export type OcrErrorCode = "OCR_UNSUPPORTED_PLATFORM" | "OCR_LANGUAGE_PACK_MISSING" | "OCR_CAPTURE_FAILED" | "OCR_EMPTY_REGION" | "OCR_TIMEOUT" | "OCR_ENGINE_FAILED";
export interface OcrErrorDto { code: OcrErrorCode; message: string; }
