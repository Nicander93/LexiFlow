import { describe, expect, it, vi } from "vitest";
import { UserFacingError } from "../electron/main/core/errors";
import {
  CLIPBOARD_COPY_TIMEOUT_MESSAGE,
  CLIPBOARD_RESTORE_FAILED_MESSAGE,
  captureClipboardText,
  textFromClipboardCapture,
  type ClipboardCapturePorts
} from "../electron/main/selection/clipboard-capture";

interface FakeClipboard {
  sequence: number;
  contents: ClipboardContents;
}

interface ClipboardContents {
  text: string;
  html: string;
  rtf: string;
  image: string;
  files: string[];
  custom: string;
}

function createFakeClipboard(initial: ClipboardContents, sequence = 10) {
  const state: FakeClipboard = { sequence, contents: { ...initial, files: [...initial.files] } };
  let time = 0;
  const restore = vi.fn((snapshot: unknown) => {
    const next = snapshot as ClipboardContents;
    state.contents = { ...next, files: [...next.files] };
    state.sequence += 1;
    return true;
  });
  const ports: ClipboardCapturePorts = {
    getSequenceNumber: () => state.sequence,
    snapshot: () => ({ ...state.contents, files: [...state.contents.files] }),
    restore,
    copy: async () => undefined,
    readText: () => state.contents.text,
    wait: async (ms) => { time += ms; },
    now: () => time
  };
  return { state, ports, restore };
}

const originalContents: ClipboardContents = {
  text: "old-text",
  html: "<p>old</p>",
  rtf: "{\\rtf1 old}",
  image: "old-image",
  files: ["C:/temp/old.txt"],
  custom: "old-custom"
};

describe("captureClipboardText", () => {
  it("复制未改变序列号时保持原剪贴板", async () => {
    const fake = createFakeClipboard(originalContents);
    const result = await captureClipboardText(fake.ports, { copyTimeoutMs: 80, pollIntervalMs: 20, settleMs: 50 });

    expect(result).toEqual({ status: "copy-timeout", text: "" });
    expect(fake.restore).not.toHaveBeenCalled();
    expect(fake.state.contents).toEqual(originalContents);
  });

  it("捕获后无外部更新时恢复原快照", async () => {
    const fake = createFakeClipboard(originalContents);
    fake.ports.copy = async () => {
      fake.state.sequence += 1;
      fake.state.contents = {
        text: "selected",
        html: "<p>selected</p>",
        rtf: "{\\rtf1 selected}",
        image: "selected-image",
        files: ["C:/temp/selected.txt"],
        custom: "selected-custom"
      };
    };

    const result = await captureClipboardText(fake.ports, { copyTimeoutMs: 80, pollIntervalMs: 20, settleMs: 50 });

    expect(result).toEqual({ status: "ok", text: "selected" });
    expect(fake.restore).toHaveBeenCalledTimes(1);
    expect(fake.state.contents).toEqual(originalContents);
  });

  it("出现较新序列号时不覆盖", async () => {
    const fake = createFakeClipboard(originalContents);
    fake.ports.copy = async () => {
      fake.state.sequence += 1;
      fake.state.contents.text = "selected";
    };
    fake.ports.wait = async (ms) => {
      if (ms === 50) {
        fake.state.sequence += 1;
        fake.state.contents = {
          text: "user-copy",
          html: "<p>user</p>",
          rtf: "{\\rtf1 user}",
          image: "user-image",
          files: ["C:/temp/user.txt"],
          custom: "user-custom"
        };
      }
    };

    const result = await captureClipboardText(fake.ports, { copyTimeoutMs: 80, pollIntervalMs: 20, settleMs: 50 });

    expect(result).toEqual({ status: "ok", text: "selected" });
    expect(fake.restore).not.toHaveBeenCalled();
    expect(fake.state.contents.text).toBe("user-copy");
    expect(fake.state.contents.custom).toBe("user-custom");
  });

  it("文本、HTML、RTF、图片、文件列表和自定义格式会随快照一起恢复", async () => {
    const fake = createFakeClipboard(originalContents);
    fake.ports.copy = async () => {
      fake.state.sequence += 1;
      fake.state.contents = {
        text: "selected",
        html: "",
        rtf: "",
        image: "",
        files: [],
        custom: ""
      };
    };

    await captureClipboardText(fake.ports, { copyTimeoutMs: 80, pollIntervalMs: 20, settleMs: 50 });

    expect(fake.state.contents).toEqual(originalContents);
  });

  it("恢复失败时返回明确状态，复制超时不误报为空选区", () => {
    expect(() => textFromClipboardCapture({ status: "copy-timeout", text: "" })).toThrow(new UserFacingError(CLIPBOARD_COPY_TIMEOUT_MESSAGE));
    expect(() => textFromClipboardCapture({ status: "restore-failed", text: "selected" })).toThrow(new UserFacingError(CLIPBOARD_RESTORE_FAILED_MESSAGE));
    expect(textFromClipboardCapture({ status: "empty", text: "" })).toBeUndefined();
    expect(textFromClipboardCapture({ status: "ok", text: "selected" })).toBe("selected");
  });
});
