import type { TargetLanguage, TranslationSegment } from "./types";

/** Reassembles translated segments according to source layout boundaries. */
export function assembleDisplayText(segments: TranslationSegment[], targetLanguage: TargetLanguage | string): string {
  return segments.reduce((text, segment, index) => {
    const boundary = index === 0 ? "sentence" : segments[index - 1].boundaryAfter ?? "sentence";
    const separator = index === 0 ? "" : boundary === "line" ? "\n" : boundary === "paragraph" || boundary === "block" ? "\n\n" : targetLanguage === "zh-CN" ? "" : " ";
    return text + separator + segment.target;
  }, "");
}
