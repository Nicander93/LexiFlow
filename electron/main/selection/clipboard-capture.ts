import { UserFacingError } from "../core/errors";

export type ClipboardCaptureStatus = "ok" | "empty" | "copy-timeout" | "restore-failed";

export interface ClipboardCaptureResult {
  status: ClipboardCaptureStatus;
  text: string;
}

export interface ClipboardCapturePorts {
  getSequenceNumber(): number;
  snapshot(): unknown;
  restore(snapshot: unknown): boolean;
  copy(): void | Promise<void>;
  readText(): string;
  wait(ms: number): Promise<void>;
  now(): number;
}

export interface ClipboardCaptureOptions {
  copyTimeoutMs?: number;
  pollIntervalMs?: number;
  settleMs?: number;
}

export const CLIPBOARD_COPY_TIMEOUT_MESSAGE = "未能读取选中文字，请重新选择或改用手动输入。";
export const CLIPBOARD_RESTORE_FAILED_MESSAGE = "无法恢复剪贴板，请检查当前剪贴板内容后手动输入。";

/** 无标记剪贴板回退：按序列号确认复制，仅在剪贴板仍是本次捕获版本时恢复快照。 */
export async function captureClipboardText(
  ports: ClipboardCapturePorts,
  options: ClipboardCaptureOptions = {}
): Promise<ClipboardCaptureResult> {
  const copyTimeoutMs = options.copyTimeoutMs ?? 800;
  const pollIntervalMs = options.pollIntervalMs ?? 20;
  const settleMs = options.settleMs ?? 50;

  const snapshot = ports.snapshot();
  const beforeSequence = ports.getSequenceNumber();
  await ports.copy();

  const deadline = ports.now() + copyTimeoutMs;
  let copySequence = ports.getSequenceNumber();
  while (copySequence === beforeSequence && ports.now() < deadline) {
    await ports.wait(pollIntervalMs);
    copySequence = ports.getSequenceNumber();
  }

  if (copySequence === beforeSequence) {
    return { status: "copy-timeout", text: "" };
  }

  const selectedText = ports.readText();
  const capturedSequence = ports.getSequenceNumber();
  await ports.wait(settleMs);
  const currentSequence = ports.getSequenceNumber();

  if (currentSequence === capturedSequence && !ports.restore(snapshot)) {
    return { status: "restore-failed", text: selectedText };
  }

  if (typeof selectedText !== "string" || selectedText.trim().length === 0) {
    return { status: "empty", text: "" };
  }
  return { status: "ok", text: selectedText };
}

export function textFromClipboardCapture(result: ClipboardCaptureResult): string | undefined {
  if (result.status === "copy-timeout") throw new UserFacingError(CLIPBOARD_COPY_TIMEOUT_MESSAGE);
  if (result.status === "restore-failed") throw new UserFacingError(CLIPBOARD_RESTORE_FAILED_MESSAGE);
  if (result.status !== "ok" || result.text.trim().length === 0) return undefined;
  return result.text;
}
