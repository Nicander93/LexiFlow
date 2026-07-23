export type ValidationResult = { ok: true; text: string } | { ok: false; message: string };

export function validateInput(text: string, maxLength: number): ValidationResult {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.trim()) return { ok: false, message: "请输入文本，或先在其他应用中选中文字。" };
  if (normalized.length > maxLength) {
    return { ok: false, message: `文本长度超过 ${maxLength} 个字符，请缩短后重试。` };
  }
  return { ok: true, text: normalized };
}

export function hasClipboardChanged(_before: string, after: string, marker: string): boolean {
  return after !== marker && after.trim().length > 0;
}
