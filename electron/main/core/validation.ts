export type ValidationResult = { ok: true; text: string } | { ok: false; message: string };

/** Normalize newlines, then reject empty / over-length input with UI-ready messages. 统一换行后做空文本和长度检查。 */
export function validateInput(text: string, maxLength: number): ValidationResult {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.trim()) return { ok: false, message: "请输入文本，或先在其他应用中选中文字。" };
  if (normalized.length > maxLength) {
    return { ok: false, message: `文本长度超过 ${maxLength} 个字符，请缩短后重试。` };
  }
  return { ok: true, text: normalized };
}

/**
 * Selection flow writes a marker first; still-marker or empty means capture failed.
 * 划词前写入 marker；仍是 marker 或空串说明没拿到真实选区。
 */
export function isCapturedSelection(after: string, marker: string): boolean {
  return after !== marker && after.trim().length > 0;
}
