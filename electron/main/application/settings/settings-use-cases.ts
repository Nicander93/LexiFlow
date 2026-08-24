import type { AppSettings, SettingsPatch, SettingsSnapshot, ShortcutRegistrationResult } from "../../../shared/types";
import { validateSettings } from "../../core/settings-validation";
import type { HistoryService } from "../history/history-service";
import { applySettingsPatch, SettingsService, type SettingsRepository } from "./settings-service";

export interface SettingsEffects {
  applyShortcuts(settings: AppSettings): ShortcutRegistrationResult;
  applyStartup?: (settings: AppSettings) => void;
  applyWindow?: (settings: AppSettings) => void;
}

/** Coordinates settings mutation, validation, runtime effects, and history pruning. */
export class SettingsUseCases {
  constructor(
    private readonly store: SettingsRepository,
    private readonly service: SettingsService,
    private readonly history: HistoryService,
    private readonly effects: SettingsEffects
  ) {}

  get(): AppSettings { return this.store.getPublic(); }
  getSnapshot(): SettingsSnapshot { return this.service.getSnapshot(); }

  async patch(command: SettingsPatch): Promise<{ snapshot: SettingsSnapshot; shortcutResult: ShortcutRegistrationResult }> {
    const before = this.store.get();
    const candidate = applySettingsPatch(before, command);
    const errors = validateSettings(candidate);
    if (errors.length) throw new Error(errors.join("\n"));
    const shortcutsChanged = JSON.stringify(before.shortcuts) !== JSON.stringify(candidate.shortcuts);
    let shortcutResult: ShortcutRegistrationResult = { translation: true, naming: true, screenshot: true, errors: [] };
    if (shortcutsChanged) {
      shortcutResult = this.effects.applyShortcuts(candidate);
      if (shortcutResult.errors.length) {
        this.effects.applyShortcuts(before);
        throw new Error(shortcutResult.errors.join("\n"));
      }
    }
    let snapshot: SettingsSnapshot;
    try {
      snapshot = await this.service.update(command);
    } catch (error) {
      if (shortcutsChanged) this.effects.applyShortcuts(before);
      throw error;
    }
    this.applyNonShortcutEffectsIfNeeded(before, snapshot.settings);
    if (JSON.stringify(before.history) !== JSON.stringify(snapshot.settings.history)) await this.history.prune(snapshot.settings.history);
    return { snapshot, shortcutResult };
  }

  reset(): Promise<{ snapshot: SettingsSnapshot; shortcutResult: ShortcutRegistrationResult }> {
    return this.patch({ type: "reset" });
  }

  private applyNonShortcutEffectsIfNeeded(before: AppSettings, after: AppSettings): void {
    const startupChanged = before.startup.enabled !== after.startup.enabled;
    const windowChanged = JSON.stringify(before.window) !== JSON.stringify(after.window);
    if (startupChanged) this.effects.applyStartup?.(after);
    if (windowChanged) this.effects.applyWindow?.(after);
  }
}
