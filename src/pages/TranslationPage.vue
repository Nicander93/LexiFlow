<script setup lang="ts">
import { onMounted, ref } from "vue";
import PageHeader from "../components/PageHeader.vue";
import ResultPanel from "../components/ResultPanel.vue";
import AppIcon from "../components/AppIcon.vue";
import { useTranslation } from "../composables/useTranslation";
import type { TargetLanguage, TranslationMode } from "../../electron/shared/types";
import { getTranslatorApi } from "../platform/translator";

const sourceText = ref("");
const mode = ref<TranslationMode>("normal");
const targetLanguage = ref<TargetLanguage>("auto");
const copied = ref(false);
const translator = getTranslatorApi();
const maxInputLength = ref(10_000);
const providerLabel = ref("本地模型");
const { status, resultText, errorMessage, isRunning, start, stop, retry } = useTranslation();

async function translate(): Promise<void> {
  await start({ text: sourceText.value, mode: mode.value, targetLanguage: targetLanguage.value });
}

async function copyResult(): Promise<void> {
  if (!resultText.value) return;
  await translator.clipboard.writeText(resultText.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1200);
}

onMounted(async () => {
  const settings = await translator.settings.get();
  maxInputLength.value = settings.translation.maxInputLength;
  targetLanguage.value = settings.translation.targetLanguage;
  providerLabel.value = settings.provider.type === "ollama" ? "本地模型" : "远程模型";

  const pending = sessionStorage.getItem("lexiflow:retranslate");
  if (!pending) return;
  sessionStorage.removeItem("lexiflow:retranslate");
  try {
    const history = JSON.parse(pending) as { sourceText: string; mode: TranslationMode; targetLanguage: TargetLanguage };
    sourceText.value = history.sourceText;
    mode.value = history.mode === "naming" ? "normal" : history.mode;
    targetLanguage.value = history.targetLanguage;
  } catch {
    // Ignore malformed session data; it should never block the translation page.
  }
});
</script>

<template>
  <div class="page">
    <PageHeader eyebrow="Quick translate" title="让文字自然地抵达另一种语言" description="忠实保留段落、代码和语气，模型生成时可以随时停止。">
      <span v-if="copied" class="success-badge"><AppIcon name="check" :size="14" />已复制</span>
      <span v-else class="status-chip">{{ providerLabel }}</span>
    </PageHeader>
    <div class="control-row">
      <div class="segmented">
        <button :class="{ active: mode === 'normal' }" @click="mode = 'normal'">普通翻译</button>
        <button :class="{ active: mode === 'technical' }" @click="mode = 'technical'">技术翻译</button>
      </div>
      <label>目标语言
        <select v-model="targetLanguage"><option value="auto">自动识别</option><option value="zh-CN">中文</option><option value="en">英文</option></select>
      </label>
    </div>
    <div class="translation-grid">
      <section class="input-panel surface">
        <div class="panel-toolbar"><span>原文</span><button class="text-button" @click="sourceText = ''">清空</button></div>
        <textarea v-model="sourceText" autofocus placeholder="输入或粘贴文本，Ctrl + Enter 执行" @keydown.ctrl.enter.prevent="translate" />
        <div class="input-footer"><span>{{ sourceText.length.toLocaleString() }} / {{ maxInputLength.toLocaleString() }}</span><button class="primary-button" :disabled="isRunning" @click="translate">开始翻译</button></div>
      </section>
      <ResultPanel :status="status" :text="resultText" :error="errorMessage" @copy="copyResult" @stop="stop" @retry="retry" />
    </div>
  </div>
</template>
