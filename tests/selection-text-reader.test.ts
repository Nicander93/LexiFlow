import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { UserFacingError } from "../electron/main/core/errors";
import {
  CLIPBOARD_COPY_TIMEOUT_MESSAGE,
  CLIPBOARD_RESTORE_FAILED_MESSAGE
} from "../electron/main/selection/clipboard-capture";
import { SelectionTextReader } from "../electron/main/selection/text-reader";
import { WindowsAutomationTextSource, WindowsClipboardTextSource } from "../electron/main/selection/windows-text-sources";

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

describe("SelectionTextReader", () => {
  it("UI Automation 成功时不访问剪贴板", async () => {
    const clipboard = { read: vi.fn(async () => "clipboard") };
    const reader = new SelectionTextReader({
      automation: { read: async () => "from-automation" },
      clipboard,
      platform: "win32"
    });

    await expect(reader.read(100)).resolves.toEqual({ text: "from-automation" });
    expect(clipboard.read).not.toHaveBeenCalled();
  });

  it("不支持或空选区时才回退剪贴板", async () => {
    const clipboard = { read: vi.fn(async () => "from-clipboard") };
    const emptyAutomation = new SelectionTextReader({
      automation: { read: async () => "   " },
      clipboard,
      platform: "win32"
    });
    const failedAutomation = new SelectionTextReader({
      automation: { read: async () => { throw new Error("no-pattern"); } },
      clipboard,
      platform: "win32"
    });

    await expect(emptyAutomation.read(100)).resolves.toEqual({ text: "from-clipboard" });
    await expect(failedAutomation.read(100)).resolves.toEqual({ text: "from-clipboard" });
    expect(clipboard.read).toHaveBeenCalledTimes(2);
  });

  it("超长文本和错误归一化保持现有行为", async () => {
    const tooLong = new SelectionTextReader({
      automation: { read: async () => "a".repeat(6) },
      clipboard: { read: async () => "clipboard" },
      platform: "win32"
    });
    const empty = new SelectionTextReader({
      automation: { read: async () => undefined },
      clipboard: { read: async () => undefined },
      platform: "win32"
    });
    const restoreFailed = new SelectionTextReader({
      automation: { read: async () => undefined },
      clipboard: { read: async () => { throw new UserFacingError(CLIPBOARD_RESTORE_FAILED_MESSAGE); } },
      platform: "win32"
    });
    const copyTimeout = new SelectionTextReader({
      automation: { read: async () => undefined },
      clipboard: { read: async () => { throw new UserFacingError(CLIPBOARD_COPY_TIMEOUT_MESSAGE); } },
      platform: "win32"
    });
    const unknown = new SelectionTextReader({
      automation: { read: async () => undefined },
      clipboard: { read: async () => { throw new Error("boom"); } },
      platform: "win32"
    });
    const skippedAutomation = { read: vi.fn(async () => "nope") };
    const skippedClipboard = { read: vi.fn(async () => "nope") };
    const otherPlatform = new SelectionTextReader({
      automation: skippedAutomation,
      clipboard: skippedClipboard,
      platform: "darwin"
    });

    await expect(tooLong.read(5)).resolves.toEqual({ text: "", error: "选中文字超过 5 个字符，请缩短后重试。" });
    await expect(empty.read(100)).resolves.toEqual({ text: "", error: "未检测到选中文字，请重新选择或手动输入。" });
    await expect(restoreFailed.read(100)).resolves.toEqual({ text: "", error: CLIPBOARD_RESTORE_FAILED_MESSAGE });
    await expect(copyTimeout.read(100)).resolves.toEqual({ text: "", error: CLIPBOARD_COPY_TIMEOUT_MESSAGE });
    await expect(unknown.read(100)).resolves.toEqual({ text: "", error: "读取选中文字失败，请改用手动输入。" });
    await expect(otherPlatform.read(100)).resolves.toEqual({ text: "", error: "划词获取仅支持 Windows，请在输入框中粘贴文本。" });
    expect(skippedAutomation.read).not.toHaveBeenCalled();
    expect(skippedClipboard.read).not.toHaveBeenCalled();
  });

  it("多个捕获请求严格串行", async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const automation = {
      read: vi.fn(async () => {
        if (automation.read.mock.calls.length === 1) {
          order.push("first-start");
          await firstGate;
          order.push("first-end");
          return "one";
        }
        order.push("second-start");
        return "two";
      })
    };
    const reader = new SelectionTextReader({
      automation,
      clipboard: { read: vi.fn(async () => "clipboard") },
      platform: "win32"
    });

    const first = reader.read(100);
    const second = reader.read(100);
    await vi.waitFor(() => expect(automation.read).toHaveBeenCalledTimes(1));
    releaseFirst();
    await expect(first).resolves.toEqual({ text: "one" });
    await expect(second).resolves.toEqual({ text: "two" });
    expect(order).toEqual(["first-start", "first-end", "second-start"]);
    expect(automation.read).toHaveBeenCalledTimes(2);
  });
});

describe("Windows 选区数据源", () => {
  it("把剪贴板事务状态映射为文字或明确错误", async () => {
    const ok = new WindowsClipboardTextSource(async () => encodeJson({ status: "ok", text: "selected" }));
    const empty = new WindowsClipboardTextSource(async () => encodeJson({ status: "empty", text: "" }));
    const timeout = new WindowsClipboardTextSource(async () => encodeJson({ status: "copy-timeout", text: "" }));
    const restoreFailed = new WindowsClipboardTextSource(async () => encodeJson({ status: "restore-failed", text: "" }));

    await expect(ok.read()).resolves.toBe("selected");
    await expect(empty.read()).resolves.toBeUndefined();
    await expect(timeout.read()).rejects.toThrow(CLIPBOARD_COPY_TIMEOUT_MESSAGE);
    await expect(restoreFailed.read()).rejects.toThrow(CLIPBOARD_RESTORE_FAILED_MESSAGE);
  });

  it("UI Automation 失败时返回空，不抛出选区内容", async () => {
    const source = new WindowsAutomationTextSource(async () => { throw new Error("exit 3"); });
    await expect(source.read()).resolves.toBeUndefined();
  });

  it("选区读取路径不写入 __LEXIFLOW_ 标记", () => {
    const directory = join(process.cwd(), "electron/main/selection");
    const sources = ["text-reader.ts", "clipboard-capture.ts", "windows-text-sources.ts"]
      .map((file) => readFileSync(join(directory, file), "utf8"))
      .join("\n");
    expect(sources).not.toMatch(/__LEXIFLOW_/);
  });
});
