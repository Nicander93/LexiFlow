import { globalShortcut } from "electron";
import type { ShortcutRegistrationResult, ShortcutSettings } from "../../shared/types";

export type HotkeyAction = "translate" | "naming" | "ocr";

export class HotkeyManager {
  private lastTriggeredAt = 0;

  constructor(private readonly onTrigger: (action: HotkeyAction) => void) {}

  register(settings: ShortcutSettings): ShortcutRegistrationResult {
    globalShortcut.unregisterAll();
    if (settings.paused) return { translation: true, naming: true, screenshot: true, errors: [] };
    const trigger = (action: HotkeyAction) => {
      const now = Date.now();
      if (now - this.lastTriggeredAt < 350) return;
      this.lastTriggeredAt = now;
      this.onTrigger(action);
    };
    const translation = settings.enableSelectionTranslation
      ? globalShortcut.register(settings.translation, () => trigger("translate"))
      : true;
    const naming = globalShortcut.register(settings.naming, () => trigger("naming"));
    const screenshot = globalShortcut.register(settings.screenshot, () => trigger("ocr"));
    const errors: string[] = [];
    if (!translation) errors.push(`快捷键 ${settings.translation} 注册失败，可能已被其他程序占用。`);
    if (!naming) errors.push(`快捷键 ${settings.naming} 注册失败，可能已被其他程序占用。`);
    if (!screenshot) errors.push(`快捷键 ${settings.screenshot} 注册失败，可能已被其他程序占用。`);
    return { translation, naming, screenshot, errors };
  }

  unregister(): void {
    globalShortcut.unregisterAll();
  }
}
