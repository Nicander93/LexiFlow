import { UserFacingError } from "../core/errors";
import type { SelectionResult } from "../../shared/types";

export interface SelectionTextSource {
  read(): Promise<string | undefined>;
}

export interface SelectionTextReaderOptions {
  automation: SelectionTextSource;
  clipboard: SelectionTextSource;
  platform?: NodeJS.Platform;
}

/** 明确触发后读取选区；请求串行，避免剪贴板回退交错。 */
export class SelectionTextReader {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly options: SelectionTextReaderOptions) {}

  read(maxLength: number): Promise<SelectionResult> {
    const task = this.queue.then(
      () => this.readNow(maxLength),
      () => this.readNow(maxLength)
    );
    this.queue = task.then(
      () => undefined,
      () => undefined
    );
    return task;
  }

  private async readNow(maxLength: number): Promise<SelectionResult> {
    if ((this.options.platform ?? process.platform) !== "win32") {
      return { text: "", error: "划词获取仅支持 Windows，请在输入框中粘贴文本。" };
    }

    try {
      const automationText = await this.options.automation.read().catch(() => undefined);
      const selectedText = hasText(automationText)
        ? automationText
        : await this.options.clipboard.read();

      if (!hasText(selectedText)) {
        return { text: "", error: "未检测到选中文字，请重新选择或手动输入。" };
      }
      const normalized = selectedText.replace(/\r\n/g, "\n");
      if (normalized.length > maxLength) {
        return { text: "", error: `选中文字超过 ${maxLength} 个字符，请缩短后重试。` };
      }
      return { text: normalized };
    } catch (error) {
      if (error instanceof UserFacingError) return { text: "", error: error.message };
      return { text: "", error: "读取选中文字失败，请改用手动输入。" };
    }
  }
}

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
