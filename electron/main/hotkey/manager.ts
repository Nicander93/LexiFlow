import { globalShortcut } from "electron";
import type { ShortcutRegistrationResult, ShortcutSettings } from "../../shared/types";
import { normalizeShortcut } from "../../shared/shortcut";

export type HotkeyAction = "translate" | "naming" | "ocr";
const actions = ["translate", "naming", "ocr"] as const;
const fields = { translate: "translation", naming: "naming", ocr: "screenshot" } as const;

function normalizeForRegistration(value: string): string {
  const trimmed = value.trim();
  if (/^CommandOrControl(?:\+|$)/i.test(trimmed)) return trimmed;
  return normalizeShortcut(trimmed);
}

export class HotkeyManager {
  private lastTriggeredAt = 0;
  private configured = new Map<HotkeyAction, string>();
  private registered = new Map<HotkeyAction, string>();
  private initialized = false;

  constructor(private readonly onTrigger: (action: HotkeyAction) => void) {}

  register(settings: ShortcutSettings, options: { allowPartial?: boolean } = {}): ShortcutRegistrationResult {
    const desired = new Map<HotkeyAction, string>();
    if (!settings.paused) {
      for (const action of actions) {
        const shortcut = normalizeForRegistration(settings[fields[action]]);
        if (shortcut) desired.set(action, shortcut);
      }
    }
    const previous = new Map(this.registered);
    const changed = actions.filter((action) => !this.initialized || desired.get(action) !== this.configured.get(action));
    for (const action of changed) this.remove(action);
    const errors: string[] = [];
    for (const action of changed) {
      const shortcut = desired.get(action);
      if (shortcut && !this.add(action, shortcut)) errors.push(this.failureMessage(shortcut));
    }
    // Startup keeps every usable binding. Later edits restore only the bindings
    // they changed, including a partially available startup configuration.
    if (errors.length && this.initialized && !options.allowPartial) {
      for (const action of changed) this.remove(action);
      for (const action of changed) {
        const shortcut = previous.get(action);
        if (shortcut && !this.add(action, shortcut)) errors.push(`原快捷键 ${shortcut} 恢复失败，请重新设置。`);
      }
    } else {
      this.configured = desired;
      this.initialized = true;
    }
    return { ...this.getStatus(), errors };
  }

  getStatus(): ShortcutRegistrationResult {
    const available = (action: HotkeyAction) => {
      const shortcut = this.configured.get(action);
      return !shortcut || (this.registered.get(action) === shortcut && globalShortcut.isRegistered(shortcut));
    };
    return {
      translation: available("translate"), naming: available("naming"), screenshot: available("ocr"),
      errors: actions.filter((action) => !available(action)).map((action) => this.failureMessage(this.configured.get(action)!))
    };
  }

  private failureMessage(shortcut: string): string {
    return `快捷键 ${shortcut} 注册失败，可能已被其他程序占用。请录制其他组合，或退出占用程序后重启 LexiFlow。`;
  }

  private add(action: HotkeyAction, shortcut: string): boolean {
    try {
      if (!globalShortcut.register(shortcut, () => {
        const now = Date.now();
        if (now - this.lastTriggeredAt < 350) return;
        this.lastTriggeredAt = now;
        this.onTrigger(action);
      })) return false;
      this.registered.set(action, shortcut);
      return true;
    } catch {
      return false;
    }
  }

  private remove(action: HotkeyAction): void {
    const shortcut = this.registered.get(action);
    if (shortcut) globalShortcut.unregister(shortcut);
    this.registered.delete(action);
  }

  unregister(): void {
    for (const action of actions) this.remove(action);
    this.configured.clear();
    this.initialized = false;
  }
}
