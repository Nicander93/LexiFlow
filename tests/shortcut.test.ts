import { describe, expect, it } from "vitest";
import {
  findShortcutConflict,
  formatShortcutForDisplay,
  isValidShortcut,
  normalizeShortcut,
  parseKeyboardEvent
} from "../electron/shared/shortcut";

const keyboard = (code: string, modifiers: Partial<Pick<KeyboardEvent, "ctrlKey" | "altKey" | "shiftKey" | "metaKey">> = {}) => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...modifiers
});

describe("shortcut utilities", () => {
  it("normalizes and formats accelerators", () => {
    expect(normalizeShortcut("control + alt + t")).toBe("Ctrl+Alt+T");
    expect(normalizeShortcut("Shift+Ctrl+s")).toBe("Ctrl+Shift+S");
    expect(formatShortcutForDisplay("Ctrl+Alt+T")).toBe("Ctrl + Alt + T");
  });

  it("maps physical keyboard codes", () => {
    expect(parseKeyboardEvent(keyboard("KeyT", { ctrlKey: true, altKey: true }))).toBe("Ctrl+Alt+T");
    expect(parseKeyboardEvent(keyboard("Space", { ctrlKey: true }))).toBe("Ctrl+Space");
    expect(parseKeyboardEvent(keyboard("ArrowUp", { altKey: true }))).toBe("Alt+Up");
    expect(parseKeyboardEvent(keyboard("ControlLeft", { ctrlKey: true }))).toBeUndefined();
  });

  it("validates combinations and standalone function keys", () => {
    expect(isValidShortcut("Ctrl+Alt+T")).toBe(true);
    expect(isValidShortcut("F8")).toBe(true);
    expect(isValidShortcut("Space")).toBe(false);
    expect(isValidShortcut("A")).toBe(false);
    expect(isValidShortcut("Ctrl")).toBe(false);
    expect(isValidShortcut("")).toBe(true);
  });

  it("finds conflicts while ignoring disabled shortcuts", () => {
    expect(findShortcutConflict({ translation: "Ctrl+Alt+T", naming: "ctrl + alt + t", screenshot: "" }))
      .toContain("不能使用相同快捷键");
    expect(findShortcutConflict({ translation: "", naming: "Ctrl+Alt+N", screenshot: "Ctrl+Alt+S" }))
      .toBeUndefined();
  });
});
