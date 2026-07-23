import { globalShortcut } from "electron";
import type { ShortcutRegistrationResult, ShortcutSettings, TranslationMode } from "../../shared/types";

export class HotkeyManager {
  private lastTriggeredAt = 0;

  constructor(private readonly onTrigger: (mode: TranslationMode) => void) {}

  register(settings: ShortcutSettings): ShortcutRegistrationResult {
    globalShortcut.unregisterAll();
    if (settings.paused) return { translation: true, naming: true, errors: [] };
    const trigger = (mode: TranslationMode) => {
      const now = Date.now();
      if (now - this.lastTriggeredAt < 350) return;
      this.lastTriggeredAt = now;
      this.onTrigger(mode);
    };
    const translation = globalShortcut.register(settings.translation, () => trigger("technical"));
    const naming = globalShortcut.register(settings.naming, () => trigger("naming"));
    const errors: string[] = [];
    if (!translation) errors.push(`快捷键 ${settings.translation} 注册失败，可能已被其他程序占用。`);
    if (!naming) errors.push(`快捷键 ${settings.naming} 注册失败，可能已被其他程序占用。`);
    return { translation, naming, errors };
  }

  unregister(): void {
    globalShortcut.unregisterAll();
  }
}
