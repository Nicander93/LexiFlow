<script setup lang="ts">
import type { AppSettings } from "../../../../electron/shared/types";
import SettingGroup from "../components/SettingGroup.vue";
import SettingRow from "../components/SettingRow.vue";

defineProps<{ settings: AppSettings }>();
const emit = defineEmits<{ save: [] }>();
</script>

<template>
  <SettingGroup title="翻译偏好">
    <SettingRow title="默认目标语言">
      <select v-model="settings.translation.targetLanguage" aria-label="默认目标语言" @change="emit('save')">
        <option value="auto">自动识别</option>
        <option value="zh-CN">中文</option>
        <option value="en">英文</option>
      </select>
    </SettingRow>
    <SettingRow title="最大输入长度" description="按 Enter 或移开焦点后保存">
      <input v-model.number="settings.translation.maxInputLength" aria-label="最大输入长度" type="number" min="100" max="100000" @blur="emit('save')" @keydown.enter="($event.target as HTMLInputElement).blur()" />
    </SettingRow>
  </SettingGroup>

  <SettingGroup title="文本整理">
    <SettingRow title="翻译前自动清理文本">
      <label class="ios-switch"><input v-model="settings.translation.autoCleanText" type="checkbox" aria-label="翻译前自动清理文本" @change="emit('save')" /><span /></label>
    </SettingRow>
    <SettingRow title="保留原始换行" :disabled="!settings.translation.autoCleanText">
      <label class="ios-switch"><input v-model="settings.translation.preserveOriginalLineBreaks" type="checkbox" aria-label="保留原始换行" :disabled="!settings.translation.autoCleanText" @change="emit('save')" /><span /></label>
    </SettingRow>
    <SettingRow title="保护 Markdown 代码块" :disabled="!settings.translation.autoCleanText">
      <label class="ios-switch"><input v-model="settings.translation.protectCodeBlocks" type="checkbox" aria-label="保护 Markdown 代码块" :disabled="!settings.translation.autoCleanText" @change="emit('save')" /><span /></label>
    </SettingRow>
  </SettingGroup>
</template>
