<script setup lang="ts">
import type { NamingOptions, TargetLanguage } from "../../../../electron/shared/types";
import UiSelect from "../../../components/UiSelect.vue";
import { computed, nextTick, ref } from "vue";
import { detectLanguage, resolveTargetLanguage } from "../../../../electron/shared/language";

const props = defineProps<{
  sourceText: string;
  mode: "normal" | "naming" | "technical";
  namingOptions: NamingOptions;
  targetLanguage: TargetLanguage;
  maxInputLength: number;
  isRunning: boolean;
  canUndo: boolean;
}>();

const emit = defineEmits<{
  "update:sourceText": [value: string];
  "update:namingOptions": [value: NamingOptions];
  "update:targetLanguage": [value: TargetLanguage];
  submit: [];
  stop: [];
  clear: [];
  undo: [];
}>();

const input = ref<HTMLTextAreaElement>();

function run(): void {
  if (props.isRunning) emit("stop");
  else if (props.sourceText.trim()) emit("submit");
}

function clearOrUndo(): void {
  if (props.sourceText) emit("clear");
  else emit("undo");
  void nextTick(() => input.value?.focus());
}

function patchNaming(patch: Partial<NamingOptions>): void {
  emit("update:namingOptions", { ...props.namingOptions, ...patch });
}

function changeNamingType(type: NamingOptions["type"]): void {
  const style = type === "class" || type === "interface" ? "PascalCase" : type === "constant" ? "SCREAMING_SNAKE_CASE" : "camelCase";
  patchNaming({ type, style });
}

const languageOptions = [
  { value: "auto", label: "自动互译" },
  { value: "zh-CN", label: "中文" },
  { value: "en", label: "英文" }
];
const sourceLanguageLabel = computed(() => props.sourceText.trim() ? (detectLanguage(props.sourceText) === "en" ? "英文" : "中文") : "中英");
const targetLanguageLabel = computed(() => resolveTargetLanguage(props.sourceText, props.targetLanguage) === "en" ? "英文" : "中文");
const namingTypeOptions = [
  { value: "variable", label: "变量名" },
  { value: "boolean", label: "布尔变量" },
  { value: "method", label: "方法" },
  { value: "class", label: "类" },
  { value: "interface", label: "接口" },
  { value: "constant", label: "常量" }
];
const namingStyleOptions = ["camelCase", "PascalCase", "snake_case", "SCREAMING_SNAKE_CASE", "kebab-case"].map((value) => ({ value, label: value }));
</script>

<template>
  <section class="workbench-composer" :class="{ naming: mode === 'naming' }">
    <div v-if="mode !== 'naming'" class="language-row">
      <span>{{ sourceLanguageLabel }}</span>
      <span aria-hidden="true">→</span>
      <UiSelect
        class="language-select"
        :model-value="targetLanguage"
        :options="languageOptions"
        label="目标语言"
        @update:model-value="emit('update:targetLanguage', $event as TargetLanguage)"
      />
      <small v-if="targetLanguage === 'auto' && sourceText.trim()" class="language-direction">译为{{ targetLanguageLabel }}</small>
    </div>
    <textarea
      ref="input"
      :value="sourceText"
      autofocus
      aria-label="原文输入"
      data-selection-text
      :maxlength="maxInputLength"
      :placeholder="mode === 'naming' ? '描述你想命名的内容' : '输入或粘贴文本'"
      @input="emit('update:sourceText', ($event.target as HTMLTextAreaElement).value)"
      @keydown.ctrl.enter.prevent="run"
    />
    <div class="composer-footer">
      <template v-if="mode === 'naming'">
        <label>类型
          <UiSelect class="naming-select" :model-value="namingOptions.type" :options="namingTypeOptions" label="类型" @update:model-value="changeNamingType($event as NamingOptions['type'])" />
        </label>
        <label>风格
          <UiSelect class="naming-select naming-style-select" :model-value="namingOptions.style" :options="namingStyleOptions" label="风格" @update:model-value="patchNaming({ style: $event as NamingOptions['style'] })" />
        </label>
      </template>
      <span v-else-if="sourceText.length >= maxInputLength * .85" class="input-count">{{ sourceText.length.toLocaleString() }} / {{ maxInputLength.toLocaleString() }}</span>
      <div class="composer-actions">
        <button v-if="sourceText || canUndo" class="text-button" type="button" @click="clearOrUndo">{{ sourceText ? '清空输入' : '撤销清空' }}</button>
        <button class="primary-button send-button" type="button" :disabled="!isRunning && !sourceText.trim()" title="Ctrl+Enter" @click="run">{{ isRunning ? '停止' : mode === 'naming' ? '生成名称' : '开始翻译' }}</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.workbench-composer {
  display: flex; flex-direction: column; min-height: 120px;
  border: 1px solid var(--border); border-radius: 12px; background: var(--surface);
  transition: border-color var(--motion-control) var(--motion-ease);
}
.workbench-composer:focus-within { border-color: var(--border-strong); box-shadow: inset 0 0 0 1px rgba(95,154,108,.12); }
.language-row {
  display: flex; align-items: center; gap: 8px; padding: 10px 14px 0;
  color: var(--muted); font-size: 13px;
}
.language-select { width: 108px; }
.language-direction { color: var(--muted); font-size: 11px; }
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
.send-button { min-width: 76px; }
@media (max-width: 620px) {
  .composer-footer { flex-wrap: wrap; }
  .naming-select { width: 102px; }
  .naming-style-select { width: 130px; }
}
</style>
