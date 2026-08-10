<script setup lang="ts">
import type { NamingOptions, TargetLanguage } from "../../../../electron/shared/types";
import UiSelect from "../../../components/UiSelect.vue";

const props = defineProps<{
  sourceText: string;
  mode: "normal" | "naming" | "technical";
  namingOptions: NamingOptions;
  targetLanguage: TargetLanguage;
  maxInputLength: number;
  isRunning: boolean;
  compact: boolean;
}>();

const emit = defineEmits<{
  "update:sourceText": [value: string];
  "update:namingOptions": [value: NamingOptions];
  "update:targetLanguage": [value: TargetLanguage];
  submit: [];
  paste: [];
  clear: [];
}>();

function patchNaming(patch: Partial<NamingOptions>): void {
  emit("update:namingOptions", { ...props.namingOptions, ...patch });
}

const languageOptions = [
  { value: "zh-CN", label: "中文" },
  { value: "en", label: "英文" }
];
const namingTypeOptions = [
  { value: "variable", label: "变量名" },
  { value: "boolean", label: "布尔变量" },
  { value: "method", label: "方法" },
  { value: "class", label: "类" },
  { value: "interface", label: "接口" },
  { value: "constant", label: "常量" }
];
const namingStyleOptions = ["camelCase", "PascalCase", "snake_case", "kebab-case"].map((value) => ({ value, label: value }));
</script>

<template>
  <section class="workbench-composer" :class="{ compact, naming: mode === 'naming' }">
    <div v-if="mode !== 'naming'" class="language-row">
      <span>自动</span>
      <span aria-hidden="true">→</span>
      <UiSelect
        class="language-select"
        :model-value="targetLanguage === 'en' ? 'en' : 'zh-CN'"
        :options="languageOptions"
        label="目标语言"
        @update:model-value="emit('update:targetLanguage', $event as TargetLanguage)"
      />
    </div>
    <textarea
      :value="sourceText"
      autofocus
      :maxlength="maxInputLength"
      :placeholder="mode === 'naming' ? '描述你想命名的内容' : '输入或粘贴文本'"
      @input="emit('update:sourceText', ($event.target as HTMLTextAreaElement).value)"
      @paste="emit('paste')"
      @keydown.ctrl.enter.prevent="emit('submit')"
    />
    <div class="composer-footer">
      <template v-if="mode === 'naming'">
        <label>类型
          <UiSelect class="naming-select" :model-value="namingOptions.type" :options="namingTypeOptions" label="类型" @update:model-value="patchNaming({ type: $event as NamingOptions['type'] })" />
        </label>
        <label>风格
          <UiSelect class="naming-select naming-style-select" :model-value="namingOptions.style" :options="namingStyleOptions" label="风格" @update:model-value="patchNaming({ style: $event as NamingOptions['style'] })" />
        </label>
      </template>
      <span v-else-if="sourceText" class="input-count">{{ sourceText.length.toLocaleString() }} / {{ maxInputLength.toLocaleString() }}</span>
      <div class="composer-actions">
        <button v-if="sourceText" class="clear-input" type="button" aria-label="清空输入" @click="emit('clear')">×</button>
        <button class="send-button" type="button" :disabled="isRunning" :aria-label="mode === 'naming' ? '生成名称' : '开始翻译'" @click="emit('submit')">↗</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.workbench-composer {
  display: flex; flex-direction: column; min-height: 120px;
  border: 1px solid var(--border); border-radius: 12px; background: var(--surface);
  transition: min-height .2s ease, border-color .18s ease;
}
.workbench-composer:focus-within { border-color: var(--border-strong); box-shadow: inset 0 0 0 1px rgba(95,154,108,.12); }
.workbench-composer.compact { min-height: 88px; }
.language-row {
  display: flex; align-items: center; gap: 8px; padding: 10px 14px 0;
  color: var(--muted); font-size: 13px;
}
.language-select { width: 82px; }
.language-select :deep(.ui-select__trigger) { min-height: 27px; padding: 2px 8px; border: 0; background: transparent; color: var(--ink-soft); font-size: 13px; box-shadow: none; }
.workbench-composer textarea {
  flex: 1; min-height: 56px; max-height: 28vh; padding: 10px 14px 4px;
  resize: none; border: 0; box-shadow: none; background: transparent;
  font-size: 14px; line-height: 1.55;
}
.workbench-composer textarea:hover, .workbench-composer textarea:focus, .workbench-composer textarea:focus-visible { border: 0; outline: 0; box-shadow: none; background: transparent; }
.composer-footer {
  min-height: 40px; display: flex; align-items: center; gap: 10px;
  padding: 4px 8px 8px 14px; color: var(--muted); font-size: 12px;
}
.composer-footer label { display: inline-flex; align-items: center; gap: 6px; }
.naming-select { width: 142px; }
.naming-style-select { width: 166px; }
.naming-select :deep(.ui-select__trigger) { min-height: 30px; padding: 3px 9px; border-radius: 7px; background: var(--surface-soft); font-size: 12px; }
.input-count { margin-right: auto; font-variant-numeric: tabular-nums; }
.composer-actions { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.clear-input, .send-button {
  width: 30px; height: 30px; display: grid; place-items: center; border: 0; border-radius: 999px;
}
.clear-input { color: var(--muted); background: transparent; font-size: 16px; }
.clear-input:hover { color: var(--ink); background: var(--surface-soft); }
.send-button { color: white; background: var(--accent); font-size: 16px; }
.send-button:hover:not(:disabled) { background: var(--accent-strong); }
.send-button:disabled { opacity: .55; }
</style>
