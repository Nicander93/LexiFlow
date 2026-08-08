import { app, safeStorage } from "electron";
import { join } from "node:path";
import { DEFAULT_SETTINGS } from "../../shared/defaults";
import type { AppSettings, SettingsPatch } from "../../shared/types";
import { JsonStore } from "./json-store";
import { isStoredSettings } from "./schema";

export interface StoredSettings extends Omit<AppSettings, "provider"> {
  provider: Omit<AppSettings["provider"], "apiKey"> & { encryptedApiKey?: string };
}

const MASKED_KEY = "••••••••";

function mergeSettings(value?: Partial<StoredSettings>): StoredSettings {
  return {
    provider: { ...DEFAULT_SETTINGS.provider, ...value?.provider, apiKey: undefined },
    shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...value?.shortcuts },
    translation: { ...DEFAULT_SETTINGS.translation, ...value?.translation },
    history: { ...DEFAULT_SETTINGS.history, ...value?.history },
    routing: { ...DEFAULT_SETTINGS.routing, ...value?.routing },
    window: { ...DEFAULT_SETTINGS.window, ...value?.window },
    startup: { ...DEFAULT_SETTINGS.startup, ...value?.startup }
  } as StoredSettings;
}

export class SettingsStore {
  private store!: JsonStore<StoredSettings>;
  private value!: StoredSettings;
  private volatileApiKey = "";

  async initialize(): Promise<void> {
    const fallback = mergeSettings();
    this.store = new JsonStore(join(app.getPath("userData"), "settings.json"), fallback, {
      backup: true,
      validate: isStoredSettings
    });
    this.value = mergeSettings(await this.store.read());
  }

  private decryptApiKey(): string {
    if (!this.value.provider.encryptedApiKey) return this.volatileApiKey;
    try {
      return safeStorage.decryptString(Buffer.from(this.value.provider.encryptedApiKey, "base64"));
    } catch {
      return this.volatileApiKey;
    }
  }

  get(): AppSettings {
    return {
      ...structuredClone(this.value),
      provider: { ...this.value.provider, apiKey: this.decryptApiKey(), encryptedApiKey: undefined }
    } as AppSettings;
  }

  getPublic(): AppSettings {
    const settings = this.get();
    const apiKeyConfigured = Boolean(settings.provider.apiKey);
    settings.provider.apiKey = "";
    settings.provider.apiKeyConfigured = apiKeyConfigured;
    return settings;
  }

  private async persist(next: AppSettings): Promise<AppSettings> {
    const currentApiKey = this.decryptApiKey();
    const requestedApiKey = next.provider.apiKey?.trim()
      ? next.provider.apiKey === MASKED_KEY
        ? currentApiKey
        : next.provider.apiKey
      : next.provider.apiKeyConfigured
        ? currentApiKey
        : "";
    const stored = mergeSettings(next as unknown as StoredSettings);
    delete (stored.provider as { apiKey?: string }).apiKey;
    delete (stored.provider as { apiKeyConfigured?: boolean }).apiKeyConfigured;
    delete stored.provider.encryptedApiKey;
    if (requestedApiKey) {
      if (safeStorage.isEncryptionAvailable()) {
        stored.provider.encryptedApiKey = safeStorage.encryptString(requestedApiKey).toString("base64");
      } else {
        this.volatileApiKey = requestedApiKey;
      }
    } else {
      this.volatileApiKey = "";
    }
    this.value = stored;
    await this.store.write(stored);
    return this.getPublic();
  }

  /** Apply a field-level patch against the latest in-memory snapshot. */
  async patch(command: SettingsPatch): Promise<AppSettings> {
    if (command.type === "reset") return this.reset();
    const current = this.get();
    const next: AppSettings = structuredClone(current);
    if (command.type === "update-provider") next.provider = { ...next.provider, ...command.value };
    else if (command.type === "update-shortcuts") next.shortcuts = { ...next.shortcuts, ...command.value };
    else if (command.type === "update-window") next.window = { ...next.window, ...command.value };
    else {
      if (command.value.translation) next.translation = { ...next.translation, ...command.value.translation };
      if (command.value.history) next.history = { ...next.history, ...command.value.history };
      if (command.value.routing) next.routing = { ...next.routing, ...command.value.routing };
      if (command.value.startup) next.startup = { ...next.startup, ...command.value.startup };
    }
    return this.persist(next);
  }

  async reset(): Promise<AppSettings> {
    this.value = mergeSettings();
    this.volatileApiKey = "";
    await this.store.write(this.value);
    return this.getPublic();
  }
}
