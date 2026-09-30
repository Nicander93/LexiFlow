import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  globalShortcut: {
    unregister: vi.fn(),
    isRegistered: vi.fn(),
    register: vi.fn()
  }
}));

import { globalShortcut } from "electron";
import { DEFAULT_SETTINGS } from "../electron/shared/defaults";
import { HotkeyManager } from "../electron/main/hotkey/manager";

describe("HotkeyManager", () => {
  const register = vi.mocked(globalShortcut.register);
  const active = new Map<string, () => void>();

  beforeEach(() => {
    vi.clearAllMocks();
    active.clear();
    register.mockImplementation((shortcut, callback) => { active.set(shortcut, callback); return true; });
    vi.mocked(globalShortcut.unregister).mockImplementation((shortcut) => { active.delete(shortcut); });
    vi.mocked(globalShortcut.isRegistered).mockImplementation((shortcut) => active.has(shortcut));
  });

  it("快捷键注册失败时恢复上一组运行时快捷键", () => {
    const manager = new HotkeyManager(() => undefined);
    const previous = { ...DEFAULT_SETTINGS.shortcuts, translation: "CommandOrControl+Alt+T", naming: "CommandOrControl+Alt+N", screenshot: "CommandOrControl+Alt+S", paused: false };
    expect(manager.register(previous).errors).toEqual([]);

    register.mockImplementation((accelerator, callback) => {
      if (accelerator === "CommandOrControl+Shift+N") return false;
      active.set(accelerator, callback);
      return true;
    });
    const failed = manager.register({ ...previous, naming: "CommandOrControl+Shift+N" });

    expect(failed.errors).toHaveLength(1);
    expect(manager.getStatus().naming).toBe(true);
    const accelerators = register.mock.calls.map(([accelerator]) => accelerator);
    expect(accelerators.slice(-2)).toEqual(["CommandOrControl+Shift+N", previous.naming]);
    expect(globalShortcut.unregister).not.toHaveBeenCalledWith(previous.translation);
    expect(globalShortcut.unregister).not.toHaveBeenCalledWith(previous.screenshot);
  });

  it("keeps available startup bindings and permits fixing one conflict at a time", () => {
    const settings = DEFAULT_SETTINGS.shortcuts;
    register.mockImplementation((shortcut, callback) => {
      if (shortcut === settings.translation || shortcut === settings.naming) return false;
      active.set(shortcut, callback); return true;
    });
    const manager = new HotkeyManager(() => undefined);
    expect(manager.register(settings).errors).toHaveLength(2);
    expect(active.has(settings.screenshot)).toBe(true);
    expect(manager.register({ ...settings, naming: "Ctrl+Alt+F14" }).errors).toEqual([]);
    expect(manager.getStatus()).toMatchObject({ translation: false, naming: true, screenshot: true });
    expect(manager.getStatus().errors).toHaveLength(1);
  });

  it("clears bindings, pauses and resumes without coupling the selection switch", () => {
    const manager = new HotkeyManager(() => undefined);
    manager.register(DEFAULT_SETTINGS.shortcuts);
    manager.register({ ...DEFAULT_SETTINGS.shortcuts, enableSelectionTranslation: false });
    expect(active.size).toBe(3);
    manager.register({ ...DEFAULT_SETTINGS.shortcuts, translation: "" });
    expect(active.size).toBe(2);
    manager.register({ ...DEFAULT_SETTINGS.shortcuts, paused: true });
    expect(active.size).toBe(0);
    manager.register(DEFAULT_SETTINGS.shortcuts);
    expect(active.size).toBe(3);
    manager.unregister();
    expect(active.size).toBe(0);
  });

  it("catches registration exceptions and restores the previous callback", () => {
    const triggered = vi.fn();
    const manager = new HotkeyManager(triggered);
    manager.register(DEFAULT_SETTINGS.shortcuts);
    const previous = register.getMockImplementation()!;
    register.mockImplementation((shortcut, callback) => {
      if (shortcut === "Ctrl+Alt+F16") throw new Error("native failure");
      return previous(shortcut, callback);
    });
    expect(manager.register({ ...DEFAULT_SETTINGS.shortcuts, naming: "Ctrl+Alt+F16" }).errors).toHaveLength(1);
    active.get(DEFAULT_SETTINGS.shortcuts.naming)?.();
    expect(triggered).toHaveBeenCalledWith("naming");
  });

  it("retains available recommended bindings when resetting despite a conflict", () => {
    const manager = new HotkeyManager(() => undefined);
    manager.register({ ...DEFAULT_SETTINGS.shortcuts, translation: "Ctrl+Alt+F16" });
    const previous = register.getMockImplementation()!;
    register.mockImplementation((shortcut, callback) => shortcut === DEFAULT_SETTINGS.shortcuts.translation ? false : previous(shortcut, callback));
    expect(manager.register(DEFAULT_SETTINGS.shortcuts, { allowPartial: true }).errors).toHaveLength(1);
    expect(active.has("Ctrl+Alt+F16")).toBe(false);
    expect(manager.getStatus()).toMatchObject({ translation: false, naming: true, screenshot: true });
  });
});
