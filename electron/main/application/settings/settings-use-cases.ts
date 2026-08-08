import type { AppSettings, SettingsPatch, SettingsSnapshot, ShortcutRegistrationResult } from "../../../shared/types";
import { validateSettings } from "../../core/settings-validation";
import type { HistoryService } from "../history/history-service";
import { applySettingsPatch, SettingsService, type SettingsRepository } from "./settings-service";

export interface SettingsEffects {
  applyShortcuts(settings: AppSettings): ShortcutRegistrationResult;
  applyStartup?: (settings: AppSettings) => void;
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
    const snapshot = await this.service.update(command);
    const shortcutResult = this.applyEffectsIfNeeded(before, snapshot.settings);
    if (JSON.stringify(before.history) !== JSON.stringify(snapshot.settings.history)) await this.history.prune(snapshot.settings.history);
    return { snapshot, shortcutResult };
  }

  reset(): Promise<{ snapshot: SettingsSnapshot; shortcutResult: ShortcutRegistrationResult }> {
    return this.patch({ type: "reset" });
  }

  private applyEffectsIfNeeded(before: AppSettings, after: AppSettings): ShortcutRegistrationResult {
    const shortcutsChanged = JSON.stringify(before.shortcuts) !== JSON.stringify(after.shortcuts);
    const startupChanged = before.startup.enabled !== after.startup.enabled;
    if (startupChanged) this.effects.applyStartup?.(after);
    return shortcutsChanged
      ? this.effects.applyShortcuts(after)
      : { translation: true, naming: true, screenshot: true, errors: [] };
  }
}
