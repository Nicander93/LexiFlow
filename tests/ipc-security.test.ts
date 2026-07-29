import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  shell: { openExternal: vi.fn() }
}));

import { assertTrustedSender } from "../electron/main/ipc/security";

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
