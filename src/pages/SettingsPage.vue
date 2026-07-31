<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import SettingsLayout from "../features/settings/SettingsLayout.vue";
import type { SettingsCategory } from "../features/settings/SettingsNav.vue";
import GeneralSettings from "../features/settings/sections/GeneralSettings.vue";
import SelectionSettings from "../features/settings/sections/SelectionSettings.vue";
import TranslationSettings from "../features/settings/sections/TranslationSettings.vue";
import ProviderSettings from "../features/settings/sections/ProviderSettings.vue";
import DictionarySettings from "../features/settings/sections/DictionarySettings.vue";
import AdvancedSettings from "../features/settings/sections/AdvancedSettings.vue";
import { useSettingsForm } from "../features/settings/useSettingsForm";
import type { AppSettings } from "../../electron/shared/types";

const category = ref<SettingsCategory>("general");
const message = ref("");
const messageType = ref<"success" | "error">("success");
const loadError = ref("");
let messageTimer: ReturnType<typeof setTimeout> | undefined;

function notify(text: string, type: "success" | "error" = "success"): void {
  message.value = text;
  messageType.value = type;
  if (messageTimer) clearTimeout(messageTimer);
  messageTimer = setTimeout(() => (message.value = ""), 4000);
}

const form = useSettingsForm(notify);
const categoryCopy = computed(() => ({
  general: ["常规", "控制应用行为和本地历史。"],
  selection: ["划词与快捷键", "设置划词入口，并通过按键直接录制全局快捷键。"],
  translation: ["翻译", "调整目标语言、输入限制和文本整理。"],
  provider: ["模型服务", "连接本地模型或 OpenAI 兼容服务。"],
  dictionary: ["词典与术语", "维护术语表与翻译配置。"],
  advanced: ["高级", "提示词、诊断与本地数据管理。"]
}[category.value]));

async function save(): Promise<void> {
  await form.saveCurrent();
}

async function saveProvider(apiKey: string): Promise<void> {
  await form.saveProvider(apiKey);
}

async function saveAndTestProvider(apiKey: string): Promise<void> {
  if (!await form.saveProvider(apiKey)) return;
  try {
    await form.testProvider();
  } catch (error) {
    notify(error instanceof Error ? error.message : "模型服务连接失败。", "error");
  }
}

function handleCleared(settings: AppSettings): void {
  form.replaceSettings(settings);
}

onMounted(async () => {
  try {
    await form.loadSettings();
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : "无法读取本地设置。";
  }
});
</script>

<template>
  <div class="page settings-page">
    <div v-if="message" class="toast" :class="messageType" aria-live="polite">{{ message }}</div>
    <div v-if="loadError" class="error-card" aria-live="polite">{{ loadError }}</div>
    <div v-else-if="form.loading.value || !form.settings.value" class="surface loading-card"><span class="spinner" />正在读取本地设置</div>
    <SettingsLayout
      v-else
      :category="category"
      :title="categoryCopy![0]"
      :description="categoryCopy![1]"
      @update:category="category = $event"
    >
      <GeneralSettings v-if="category === 'general'" :settings="form.settings.value" @save="save" />
      <SelectionSettings
        v-else-if="category === 'selection'"
        :settings="form.settings.value"
        :profiles="form.profiles.value"
        @save="save"
        @error="notify($event, 'error')"
      />
      <TranslationSettings v-else-if="category === 'translation'" :settings="form.settings.value" @save="save" />
      <ProviderSettings
        v-else-if="category === 'provider'"
        :settings="form.settings.value"
        :models="form.models.value"
        :api-key-configured="form.apiKeyConfigured.value"
        :saving="form.saving.value"
        @save="saveProvider"
        @test="saveAndTestProvider"
      />
      <DictionarySettings v-else-if="category === 'dictionary'" @notify="notify" />
      <AdvancedSettings
        v-else
        :settings="form.settings.value"
        @save="save"
        @cleared="handleCleared"
        @notify="notify"
      />
    </SettingsLayout>
  </div>
</template>