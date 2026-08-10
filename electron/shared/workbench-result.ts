import type { NamingResult, TranslationMode, TranslationSegment, TranslationStatus } from "./types";

export type WorkbenchResultType =
  | "empty"
  | "dictionary"
  | "translation"
  | "bilingual"
  | "naming"
  | "loading"
  | "error";

export function resolveWorkbenchResultType(input: {
  mode: TranslationMode;
  sourceText: string;
  status: TranslationStatus;
  displayResultText: string;
  displaySegments: TranslationSegment[];
  showMainDictionary: boolean;
  namingResult: NamingResult | null;
}): WorkbenchResultType {
  if (!input.sourceText && input.status === "idle") return "empty";
  if (input.showMainDictionary) return "dictionary";
  if (input.mode === "naming" && input.namingResult) return "naming";
  if (input.status === "loading" || input.status === "streaming") return "loading";
  if (input.status === "error") return "error";
  if (
    input.mode !== "naming"
    && input.status === "success"
    && input.displaySegments.length > 1
    && input.sourceText.length > 240
  ) {
    return "bilingual";
  }
  if (input.status === "success" && input.displayResultText) return "translation";
  if (input.displayResultText || input.status !== "idle") return "loading";
  return "empty";
}
