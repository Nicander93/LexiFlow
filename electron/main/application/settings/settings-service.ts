import { DEFAULT_SETTINGS } from "../../../shared/defaults";
import type { AppSettings, SettingsPatch, SettingsSnapshot } from "../../../shared/types";

export interface SettingsRepository {
  get(): AppSettings;
  getPublic(): AppSettings;
  patch(command: SettingsPatch): Promise<AppSettings>;
  reset(): Promise<AppSettings>;
}

/**
 * Main-process owner of settings mutations. Commands are serialized and each
 * patch is merged from the latest snapshot, so independent callers cannot
 * overwrite fields they did not change.
 */
export class SettingsService {
  private revision = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly store: SettingsRepository) {}

  getSnapshot(): SettingsSnapshot {
    return { revision: this.revision, settings: this.store.getPublic() };
  }

  update(command: SettingsPatch): Promise<SettingsSnapshot> {
    const operation = this.queue.then(async () => {
      await this.store.patch(command);
      this.revision += 1;
      return this.getSnapshot();
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  patchWindow(value: Partial<AppSettings["window"]>): Promise<SettingsSnapshot> {
    return this.update({ type: "update-window", value });
  }

  patchShortcuts(value: Partial<AppSettings["shortcuts"]>): Promise<SettingsSnapshot> {
    return this.update({ type: "update-shortcuts", value });
  }

  reset(): Promise<SettingsSnapshot> {
    return this.update({ type: "reset" });
  }

  static isPatch(value: unknown): value is SettingsPatch {
    return Boolean(value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string");
  }
}

export function applySettingsPatch(settings: AppSettings, command: SettingsPatch): AppSettings {
  if (command.type === "reset") return structuredClone(DEFAULT_SETTINGS);
  const next = structuredClone(settings);
  if (command.type === "update-provider") next.provider = { ...next.provider, ...command.value };
  else if (command.type === "update-shortcuts") next.shortcuts = { ...next.shortcuts, ...command.value };
  else if (command.type === "update-window") next.window = { ...next.window, ...command.value };
  else {
    if (command.value.translation) next.translation = { ...next.translation, ...command.value.translation };
    if (command.value.history) next.history = { ...next.history, ...command.value.history };
    if (command.value.routing) next.routing = { ...next.routing, ...command.value.routing };
    if (command.value.startup) next.startup = { ...next.startup, ...command.value.startup };
  }
  return next;
}
