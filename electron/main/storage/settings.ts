import { app, safeStorage } from "electron";
import { join } from "node:path";
import { DEFAULT_SETTINGS } from "../../shared/defaults";
import type { AppSettings } from "../../shared/types";
import { JsonStore } from "./json-store";

interface StoredSettings extends Omit<AppSettings, "provider"> {
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
    this.store = new JsonStore(join(app.getPath("userData"), "settings.json"), fallback);
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

  async update(next: AppSettings): Promise<AppSettings> {
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

  async reset(): Promise<AppSettings> {
    this.value = mergeSettings();
    this.volatileApiKey = "";
    await this.store.write(this.value);
    return this.getPublic();
  }
}
