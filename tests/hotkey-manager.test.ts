import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  globalShortcut: {
    unregisterAll: vi.fn(),
    register: vi.fn()
  }
}));

import { globalShortcut } from "electron";
import { DEFAULT_SETTINGS } from "../electron/shared/defaults";
import { HotkeyManager } from "../electron/main/hotkey/manager";

describe("HotkeyManager", () => {
  const register = vi.mocked(globalShortcut.register);

  beforeEach(() => {
    vi.clearAllMocks();
    register.mockImplementation(() => true);
  });

  it("快捷键注册失败时恢复上一组运行时快捷键", () => {
    const manager = new HotkeyManager(() => undefined);
    const previous = { ...DEFAULT_SETTINGS.shortcuts, translation: "CommandOrControl+Alt+T", naming: "CommandOrControl+Alt+N", screenshot: "CommandOrControl+Alt+S", paused: false };
    expect(manager.register(previous).errors).toEqual([]);

    register.mockImplementation((accelerator) => accelerator !== "CommandOrControl+Shift+N");
    const failed = manager.register({ ...previous, naming: "CommandOrControl+Shift+N" });

    expect(failed.errors).toHaveLength(1);
    expect(failed.naming).toBe(false);
    const accelerators = register.mock.calls.map(([accelerator]) => accelerator);
    expect(accelerators.slice(-3)).toEqual([previous.translation, previous.naming, previous.screenshot]);
  });
});
