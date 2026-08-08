import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  shell: { openExternal: vi.fn() }
}));

import { assertTrustedSender } from "../electron/main/ipc/security";
import { parseGlossaryEntry, parseHistoryRevisionUpdate, parseOcrRegion, parseSettingsPatch, parseTranslationProfile, parseTranslationRequest } from "../electron/main/ipc/validation";

function fakeEvent(url: string, isMainFrame = true): Electron.IpcMainInvokeEvent {
  const frame = { url };
  return {
    senderFrame: frame,
    sender: { mainFrame: isMainFrame ? frame : { url: "other" } }
  } as unknown as Electron.IpcMainInvokeEvent;
}

describe("IPC Sender 校验", () => {
  it("接受 file 协议的应用页面", () => {
    expect(() => assertTrustedSender(fakeEvent("file:///C:/app/dist/index.html"))).not.toThrow();
  });

  it("拒绝未知 http 来源和非主 Frame", () => {
    expect(() => assertTrustedSender(fakeEvent("https://evil.example"))).toThrow("未知页面");
    expect(() => assertTrustedSender(fakeEvent("file:///C:/app/dist/index.html", false))).toThrow("非主 Frame");
  });
});

describe("IPC DTO 运行时校验", () => {
  it("拒绝非法翻译枚举、空文本和越界 OCR 选区", () => {
    expect(() => parseTranslationRequest({ text: "hello", mode: "unknown", targetLanguage: "en" })).toThrow();
    expect(() => parseTranslationRequest({ text: "", mode: "normal", targetLanguage: "en" })).toThrow();
    expect(() => parseOcrRegion({ captureId: "capture", region: { x: 0.1, y: 0.1, width: 2, height: 0.2 } })).toThrow();
  });

  it("拒绝未通过 schema 的历史、术语和 Profile DTO", () => {
    expect(() => parseHistoryRevisionUpdate({ id: "history", revisions: [{ id: "r" }], resultText: "text" })).toThrow();
    expect(() => parseGlossaryEntry({ id: "g", sourceTerm: "a" })).toThrow();
    expect(() => parseTranslationProfile({ id: "p", name: "Profile", targetLanguage: "fr" })).toThrow();
    expect(() => parseSettingsPatch({ type: "update-general", value: { translation: { maxInputLength: "huge" } } })).toThrow();
  });
});
