import type { ShortcutSettings } from "./types";

export interface ShortcutKeyboardInput {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const MODIFIER_CODES = new Set([
  "ControlLeft", "ControlRight", "AltLeft", "AltRight",
  "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight"
]);

const NAMED_KEYS: Record<string, string> = {
  Space: "Space",
  Enter: "Enter",
  Tab: "Tab",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Insert: "Insert",
  Delete: "Delete",
  Backspace: "Backspace"
};

function normalizeMainKey(value: string): string {
  if (/^[a-z]$/i.test(value)) return value.toUpperCase();
  if (/^f(?:[1-9]|1\d|2[0-4])$/i.test(value)) return value.toUpperCase();
  const named = Object.values(NAMED_KEYS).find((key) => key.toLowerCase() === value.toLowerCase());
  return named ?? value;
}

/** 将快捷键统一为 Electron Accelerator 存储格式。 */
export function normalizeShortcut(value: string): string {
  const tokens = value.split("+").map((token) => token.trim()).filter(Boolean);
  if (!tokens.length) return "";
  const modifiers = new Set<string>();
  let mainKey = "";
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower === "ctrl" || lower === "control" || lower === "cmdorctrl") modifiers.add("Ctrl");
    else if (lower === "alt" || lower === "option") modifiers.add("Alt");
    else if (lower === "shift") modifiers.add("Shift");
    else if (lower === "super" || lower === "meta" || lower === "command" || lower === "cmd") modifiers.add("Super");
    else if (mainKey) return "";
    else mainKey = normalizeMainKey(token);
  }
  return [...["Ctrl", "Alt", "Shift", "Super"].filter((key) => modifiers.has(key)), mainKey].filter(Boolean).join("+");
}

/** 将存储格式转换为界面友好的展示格式。 */
export function formatShortcutForDisplay(value: string): string {
  return normalizeShortcut(value).split("+").filter(Boolean).join(" + ");
}

/** 根据物理按键 code 生成不受键盘布局影响的 Accelerator。 */
export function parseKeyboardEvent(event: ShortcutKeyboardInput): string | undefined {
  if (MODIFIER_CODES.has(event.code)) return undefined;
  let mainKey = NAMED_KEYS[event.code];
  if (!mainKey && /^Key[A-Z]$/.test(event.code)) mainKey = event.code.slice(3);
  if (!mainKey && /^Digit[0-9]$/.test(event.code)) mainKey = event.code.slice(5);
  if (!mainKey && /^F(?:[1-9]|1\d|2[0-4])$/.test(event.code)) mainKey = event.code;
  if (!mainKey) return undefined;
  const modifiers = [
    event.ctrlKey && "Ctrl",
    event.altKey && "Alt",
    event.shiftKey && "Shift",
    event.metaKey && "Super"
  ].filter(Boolean);
  return [...modifiers, mainKey].join("+");
}

/** 空值表示停用；功能键可单独使用，其他按键至少需要一个修饰键。 */
export function isValidShortcut(value: string): boolean {
  if (!value.trim()) return true;
  const normalized = normalizeShortcut(value);
  if (!normalized) return false;
  const tokens = normalized.split("+");
  const mainKey = tokens.at(-1) ?? "";
  if (/^F(?:[1-9]|1\d|2[0-4])$/.test(mainKey)) return tokens.length === 1 || tokens.length > 1;
  return tokens.length > 1;
}

export function findShortcutConflict(
  shortcuts: Pick<ShortcutSettings, "translation" | "naming" | "screenshot">
): string | undefined {
  const entries = [
    ["快速翻译", shortcuts.translation],
    ["编程命名", shortcuts.naming],
    ["截图 OCR", shortcuts.screenshot]
  ] as const;
  const used = new Map<string, string>();
  for (const [label, value] of entries) {
    const normalized = normalizeShortcut(value);
    if (!normalized) continue;
    const previous = used.get(normalized.toLowerCase());
    if (previous) return `${previous}与${label}不能使用相同快捷键。`;
    used.set(normalized.toLowerCase(), label);
  }
  return undefined;
}
