import { execFile } from "node:child_process";
import { clipboard, type NativeImage } from "electron";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import type { SelectionResult } from "../../shared/types";
import { hasClipboardChanged } from "../core/validation";

const execFileAsync = promisify(execFile);
const COPY_COMMAND = "$ws = New-Object -ComObject WScript.Shell; $ws.SendKeys('^c')";

interface ClipboardSnapshot {
  text: string;
  html: string;
  rtf: string;
  image: NativeImage;
}

const wait = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));

function snapshotClipboard(): ClipboardSnapshot {
  return {
    text: clipboard.readText(),
    html: clipboard.readHTML(),
    rtf: clipboard.readRTF(),
    image: clipboard.readImage()
  };
}

function restoreClipboard(snapshot: ClipboardSnapshot): void {
  clipboard.write({
    text: snapshot.text,
    html: snapshot.html || undefined,
    rtf: snapshot.rtf || undefined,
    image: snapshot.image.isEmpty() ? undefined : snapshot.image
  });
}

export async function captureSelectedText(maxLength: number): Promise<SelectionResult> {
  if (process.platform !== "win32") {
    return { text: "", error: "划词获取仅支持 Windows，请在输入框中粘贴文本。" };
  }
  const snapshot = snapshotClipboard();
  const marker = `__LEXIFLOW_${randomUUID()}__`;
  try {
    clipboard.writeText(marker);
    await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", COPY_COMMAND], {
      windowsHide: true,
      timeout: 2_000
    });
    let selectedText = marker;
    for (let attempt = 0; attempt < 8 && selectedText === marker; attempt += 1) {
      await wait(40);
      selectedText = clipboard.readText();
    }
    if (!hasClipboardChanged(snapshot.text, selectedText, marker)) {
      return { text: "", error: "未检测到选中文字，请重新选择或手动输入。" };
    }
    if (selectedText.length > maxLength) {
      return { text: "", error: `选中文字超过 ${maxLength} 个字符，请缩短后重试。` };
    }
    return { text: selectedText };
  } catch {
    return { text: "", error: "读取选中文字失败，请改用手动输入。" };
  } finally {
    await wait(40);
    restoreClipboard(snapshot);
  }
}
