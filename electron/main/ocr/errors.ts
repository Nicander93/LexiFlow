import type { OcrErrorCode } from "../../shared/types";

export class OcrError extends Error {
  constructor(readonly code: OcrErrorCode, message: string) {
    super(message);
    this.name = "OcrError";
  }
}

