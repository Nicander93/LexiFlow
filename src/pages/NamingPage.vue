<script setup lang="ts">
import { computed, ref } from "vue";
import PageHeader from "../components/PageHeader.vue";
import UiSelect from "../components/UiSelect.vue";
import { useTranslation } from "../features/translation/useTranslation";
import type { NamingOptions, NamingResult } from "../../electron/shared/types";
import { getTranslatorApi } from "../platform/translator";

const sourceText = ref("");
const options = ref<NamingOptions>({ type: "boolean", style: "camelCase", language: "java" });
const copiedName = ref("");
const translator = getTranslatorApi();
const { status, resultText, errorMessage, isRunning, start, stop, retry } = useTranslation();
const namingTypeOptions = [
  { value: "variable", label: "普通变量" }, { value: "boolean", label: "布尔变量" },
  { value: "method", label: "方法" }, { value: "class", label: "类" },
  { value: "interface", label: "接口" }, { value: "database_field", label: "数据库字段" },
  { value: "constant", label: "常量" }, { value: "file", label: "文件名" }, { value: "api_path", label: "接口路径" }
];
const namingStyleOptions = ["camelCase", "PascalCase", "snake_case", "SCREAMING_SNAKE_CASE", "kebab-case"].map((value) => ({ value, label: value }));
const languageOptions = [
  { value: "java", label: "Java" }, { value: "typescript", label: "TypeScript" },
  { value: "javascript", label: "JavaScript" }, { value: "python", label: "Python" },
  { value: "sql", label: "SQL" }, { value: "general", label: "通用" }
];

const namingResult = computed<NamingResult | null>(() => {
  if (status.value !== "success") return null;
  try { return JSON.parse(resultText.value) as NamingResult; } catch { return null; }
});

async function generate(): Promise<void> {
  await start({ text: sourceText.value, mode: "naming", targetLanguage: "en", namingOptions: options.value, surface: "main" });
}

async function copyName(name: string): Promise<void> {
  await translator.clipboard.writeText(name);
  copiedName.value = name;
  setTimeout(() => (copiedName.value = ""), 1200);
}
</script>

<template>
  <div class="page">
    <PageHeader title="命名" />
    <section class="surface naming-form">
      <label class="wide-field">业务语义<textarea v-model="sourceText" placeholder="例如：是否已经完成水文数据同步" @keydown.ctrl.enter.prevent="generate" /></label>
      <div class="form-grid">
        <label>命名类型<UiSelect :model-value="options.type" :options="namingTypeOptions" label="命名类型" @update:model-value="options.type = $event as NamingOptions['type']" /></label>
        <label>命名风格<UiSelect :model-value="options.style" :options="namingStyleOptions" label="命名风格" @update:model-value="options.style = $event as NamingOptions['style']" /></label>
        <label>目标语言<UiSelect :model-value="options.language" :options="languageOptions" label="目标语言" @update:model-value="options.language = $event as NamingOptions['language']" /></label>
      </div>
      <div class="form-actions"><button v-if="isRunning" class="secondary-button" @click="stop">停止</button><button class="primary-button" :disabled="isRunning" @click="generate">生成名称</button></div>
    </section>
    <section v-if="status === 'error'" class="error-card">{{ errorMessage }} <button class="text-button" @click="retry">重试</button></section>
    <section v-else-if="isRunning" class="surface loading-card"><span class="spinner" />正在生成符合约束的候选名称…</section>
    <section v-else-if="namingResult" class="candidate-list">
      <div class="recommended-card"><small>推荐名称</small><code>{{ namingResult.recommended }}</code><button class="primary-button" @click="copyName(namingResult.recommended)">{{ copiedName === namingResult.recommended ? '已复制' : '复制' }}</button></div>
      <article v-for="candidate in namingResult.candidates" :key="candidate.name" class="candidate-card"><div><code>{{ candidate.name }}</code><p>{{ candidate.meaning }}</p></div><button class="text-button" @click="copyName(candidate.name)">{{ copiedName === candidate.name ? '已复制' : '复制' }}</button></article>
    </section>
    <section v-else class="empty-card"><strong>候选名称会整齐地出现在这里</strong><br><small>建议先写清楚“谁、做什么、处于什么状态”</small></section>
  </div>
</template>
