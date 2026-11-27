<script setup lang="ts">
import { ref } from "vue";
import { DEFAULT_PROMPTS } from "../../../../electron/shared/defaults";
import type { AppSettings } from "../../../../electron/shared/types";
import { getTranslatorApi } from "../../../platform/translator";
import SettingGroup from "../components/SettingGroup.vue";
import InlineConfirm from "../../../components/InlineConfirm.vue";

const props = defineProps<{ settings: AppSettings }>();
const emit = defineEmits<{
  save: [];
  cleared: [settings: AppSettings];
  notify: [message: string, type?: "success" | "error"];
}>();
const translator = getTranslatorApi();
const promptsOpen = ref(false);
const confirmClear = ref(false);
const clearing = ref(false);

function restorePrompts(): void {
  props.settings.translation.normalPrompt = DEFAULT_PROMPTS.normal;
  props.settings.translation.technicalPrompt = DEFAULT_PROMPTS.technical;
  props.settings.translation.namingPrompt = DEFAULT_PROMPTS.naming;
}

async function exportDiagnostics(): Promise<void> {
  try {
    const result = await translator.diagnostics.exportReport();
    if (result.saved) emit("notify", "已导出脱敏诊断信息。");
  } catch (error) {
    emit("notify", error instanceof Error ? error.message : "导出诊断失败。", "error");
  }
}

async function clearData(): Promise<void> {
  if (clearing.value) return;
  clearing.value = true;
  try {
    await translator.privacy.clearLocalData();
    window.dispatchEvent(new CustomEvent("lexiflow:local-data-cleared"));
    const settings = await translator.settings.get();
    confirmClear.value = false;
    emit("cleared", settings);
    emit("notify", "本地数据已清除，应用设置已恢复默认值。");
  } catch (error) {
    emit("notify", error instanceof Error ? error.message : "清除本地数据失败。", "error");
  } finally {
    clearing.value = false;
  }
}
</script>

<template>
  <SettingGroup title="高级提示词" description="通常无需修改，仅在需要严格输出格式时使用。">
    <button class="settings-disclosure" type="button" :aria-expanded="promptsOpen" @click="promptsOpen = !promptsOpen">
      <span>自定义提示词</span><span>{{ promptsOpen ? "收起" : "展开" }}</span>
    </button>
    <Transition name="panel"><div v-if="promptsOpen" class="prompt-list compact-prompts">
      <label>普通翻译<textarea v-model="settings.translation.normalPrompt" /></label>
      <label>技术翻译<textarea v-model="settings.translation.technicalPrompt" /></label>
      <label>编程命名<textarea v-model="settings.translation.namingPrompt" /></label>
      <div class="settings-actions">
        <button class="text-button" @click="restorePrompts">恢复默认</button>
        <button class="primary-button" @click="emit('save')">保存提示词</button>
      </div>
    </div></Transition>
  </SettingGroup>

  <SettingGroup title="诊断">
    <div class="settings-actions settings-actions--start">
      <button class="secondary-button" @click="exportDiagnostics">导出脱敏诊断</button>
    </div>
  </SettingGroup>

  <section class="danger-zone">
    <div><strong>清除所有本地数据</strong><small>删除历史、单词本、术语表、翻译配置和文档任务，并恢复默认设置。</small></div>
    <button v-if="!confirmClear" class="text-button danger" @click="confirmClear = true">清除本地数据</button>
    <InlineConfirm v-else message="清除后无法恢复。" action="确认清除" :busy="clearing" @cancel="confirmClear = false" @confirm="clearData" />
  </section>
</template>
