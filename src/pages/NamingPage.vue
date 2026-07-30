<script setup lang="ts">
import { computed, ref } from "vue";
import PageHeader from "../components/PageHeader.vue";
import { useTranslation } from "../features/translation/useTranslation";
import type { NamingOptions, NamingResult } from "../../electron/shared/types";
import { getTranslatorApi } from "../platform/translator";

const sourceText = ref("");
const options = ref<NamingOptions>({ type: "boolean", style: "camelCase", language: "java" });
const copiedName = ref("");
const translator = getTranslatorApi();
const { status, resultText, errorMessage, isRunning, start, stop, retry } = useTranslation();

const namingResult = computed<NamingResult | null>(() => {
  if (status.value !== "success") return null;
  try { return JSON.parse(resultText.value) as NamingResult; } catch { return null; }
});

async function generate(): Promise<void> {
  await start({ text: sourceText.value, mode: "naming", targetLanguage: "en", namingOptions: options.value });
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
        <label>命名类型<select v-model="options.type"><option value="variable">普通变量</option><option value="boolean">布尔变量</option><option value="method">方法</option><option value="class">类</option><option value="interface">接口</option><option value="database_field">数据库字段</option><option value="constant">常量</option><option value="file">文件名</option><option value="api_path">接口路径</option></select></label>
        <label>命名风格<select v-model="options.style"><option>camelCase</option><option>PascalCase</option><option>snake_case</option><option>SCREAMING_SNAKE_CASE</option><option>kebab-case</option></select></label>
        <label>目标语言<select v-model="options.language"><option value="java">Java</option><option value="typescript">TypeScript</option><option value="javascript">JavaScript</option><option value="python">Python</option><option value="sql">SQL</option><option value="general">通用</option></select></label>
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
