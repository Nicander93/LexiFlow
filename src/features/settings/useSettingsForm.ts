import { onMounted, onUnmounted, shallowRef, type ShallowRef } from "vue";
import type { AppSettings, ProviderModel, TranslationProfile } from "../../../electron/shared/types";
import { toIpcPayload } from "../../../electron/shared/serialization";
import { getTranslatorApi } from "../../platform/translator";

type Notify = (message: string, type?: "success" | "error") => void;

export interface SettingsForm {
  settings: ShallowRef<AppSettings | undefined>;
  profiles: ShallowRef<TranslationProfile[]>;
  models: ShallowRef<ProviderModel[]>;
  loading: ShallowRef<boolean>;
  saving: ShallowRef<boolean>;
  apiKeyConfigured: ShallowRef<boolean>;
  loadSettings: () => Promise<void>;
  saveCurrent: (options?: { notify?: boolean; apiKey?: string }) => Promise<boolean>;
  saveProvider: (apiKey: string) => Promise<boolean>;
  testProvider: () => Promise<void>;
  replaceSettings: (settings: AppSettings) => void;
}

/** 统一设置保存、快照和失败回滚，避免各分类重复提交完整配置。 */
export function useSettingsForm(notify: Notify): SettingsForm {
  const translator = getTranslatorApi();
  const settings = shallowRef<AppSettings>();
  const snapshot = shallowRef<AppSettings>();
  const profiles = shallowRef<TranslationProfile[]>([]);
  const models = shallowRef<ProviderModel[]>([]);
  const loading = shallowRef(true);
  const saving = shallowRef(false);
  const apiKeyConfigured = shallowRef(false);
  let saveQueue: Promise<boolean> = Promise.resolve(true);

  function replaceSettings(value: AppSettings): void {
    settings.value = structuredClone(value);
  }

  function acceptSettings(value: AppSettings): void {
    replaceSettings(value);
    snapshot.value = structuredClone(value);
    apiKeyConfigured.value = Boolean(value.provider.apiKeyConfigured);
  }

  function handleSettingsUpdated(event: Event): void {
    acceptSettings((event as CustomEvent<AppSettings>).detail);
  }

  onMounted(() => window.addEventListener("lexiflow:settings-updated", handleSettingsUpdated));
  onUnmounted(() => window.removeEventListener("lexiflow:settings-updated", handleSettingsUpdated));

  async function loadSettings(): Promise<void> {
    loading.value = true;
    try {
      const [loaded, loadedProfiles] = await Promise.all([
        translator.settings.get(),
        translator.profiles.list()
      ]);
      acceptSettings(loaded);
      profiles.value = loadedProfiles;
    } finally {
      loading.value = false;
    }
  }

  function saveCurrent(options: { notify?: boolean; apiKey?: string } = {}): Promise<boolean> {
    if (!settings.value) return Promise.resolve(false);
    const candidate = toIpcPayload(settings.value);
    candidate.provider.apiKey = options.apiKey ?? "";
    candidate.provider.apiKeyConfigured = options.apiKey?.trim() ? false : apiKeyConfigured.value;
    const operation = saveQueue.then(async () => {
      const requiresConfirmation = candidate.provider.type === "openai-compatible"
        && !candidate.provider.remoteUsageConfirmed;
      if (requiresConfirmation) {
        const accepted = window.confirm("远程模型会收到待翻译内容。请确认你已了解该服务的隐私政策，并同意发送内容。");
        if (!accepted) {
          if (snapshot.value) replaceSettings(snapshot.value);
          return false;
        }
        candidate.provider.remoteUsageConfirmed = true;
      }
      if (candidate.provider.type === "ollama") candidate.provider.remoteUsageConfirmed = false;
      saving.value = true;
      try {
        const result = await translator.settings.update(candidate);
        acceptSettings(result.settings);
        window.dispatchEvent(new CustomEvent("lexiflow:settings-updated", { detail: result.settings }));
        if (options.notify) notify("设置已保存。");
        return true;
      } catch (error) {
        if (snapshot.value) replaceSettings(snapshot.value);
        notify(error instanceof Error ? error.message : "设置保存失败。", "error");
        return false;
      } finally {
        saving.value = false;
      }
    });
    saveQueue = operation.catch(() => false);
    return operation;
  }
  async function saveProvider(apiKey: string): Promise<boolean> {
    return saveCurrent({ notify: true, apiKey });
  }

  async function testProvider(): Promise<void> {
    const health = await translator.provider.healthCheck();
    notify(health.message, health.ok ? "success" : "error");
    if (health.ok) models.value = await translator.provider.getModels();
  }

  return {
    settings,
    profiles,
    models,
    loading,
    saving,
    apiKeyConfigured,
    loadSettings,
    saveCurrent,
    saveProvider,
    testProvider,
    replaceSettings
  };
}
