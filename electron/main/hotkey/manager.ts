import { globalShortcut } from "electron";
import type { ShortcutRegistrationResult, ShortcutSettings } from "../../shared/types";
import { normalizeShortcut } from "../../shared/shortcut";

export type HotkeyAction = "translate" | "naming" | "ocr";

function normalizeForRegistration(value: string): string {
  const trimmed = value.trim();
  // Keep Electron's cross-platform alias intact for existing user settings.
  if (/^CommandOrControl(?:\+|$)/i.test(trimmed)) return trimmed;
  return normalizeShortcut(trimmed);
}

export class HotkeyManager {
  private lastTriggeredAt = 0;
  private lastSettings?: ShortcutSettings;

  constructor(private readonly onTrigger: (action: HotkeyAction) => void) {}

  /** 原子替换快捷键；任一注册失败时恢复上一组。 */
  register(settings: ShortcutSettings): ShortcutRegistrationResult {
    const previous = this.lastSettings ? structuredClone(this.lastSettings) : undefined;
    const result = this.registerUnsafe(settings);
    if (result.errors.length) {
      if (previous) this.registerUnsafe(previous);
      else globalShortcut.unregisterAll();
      return result;
    }
    this.lastSettings = structuredClone({
      ...settings,
      translation: normalizeForRegistration(settings.translation),
      naming: normalizeForRegistration(settings.naming),
      screenshot: normalizeForRegistration(settings.screenshot)
    });
    return result;
  }

  private registerUnsafe(settings: ShortcutSettings): ShortcutRegistrationResult {
    globalShortcut.unregisterAll();
    const result = this.registerCurrent(settings);
    if (result.errors.length) {
      globalShortcut.unregisterAll();
      if (this.lastSettings) this.registerCurrent(this.lastSettings);
      return result;
    }
    this.lastSettings = structuredClone(settings);
    return result;
  }

  private registerCurrent(settings: ShortcutSettings): ShortcutRegistrationResult {
    if (settings.paused) return { translation: true, naming: true, screenshot: true, errors: [] };
    const trigger = (action: HotkeyAction) => {
      const now = Date.now();
      if (now - this.lastTriggeredAt < 350) return;
      this.lastTriggeredAt = now;
      this.onTrigger(action);
    };
    const register = (value: string, action: HotkeyAction): boolean => {
      const shortcut = normalizeForRegistration(value);
      return !shortcut || globalShortcut.register(shortcut, () => trigger(action));
    };
    const translation = register(settings.translation, "translate");
    const naming = register(settings.naming, "naming");
    const screenshot = register(settings.screenshot, "ocr");
    const errors: string[] = [];
    if (!translation) errors.push(`快捷键 ${settings.translation} 注册失败，可能已被其他程序占用。`);
    if (!naming) errors.push(`快捷键 ${settings.naming} 注册失败，可能已被其他程序占用。`);
    if (!screenshot) errors.push(`快捷键 ${settings.screenshot} 注册失败，可能已被其他程序占用。`);
    return { translation, naming, screenshot, errors };
  }

  unregister(): void {
    globalShortcut.unregisterAll();
    this.lastSettings = undefined;
  }
}
