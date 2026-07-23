<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useTranslation } from "../composables/useTranslation";
import type { NamingResult, TranslationMode } from "../../electron/shared/types";
import { getTranslatorApi } from "../platform/translator";

const mode = ref<TranslationMode>("technical");
const sourceText = ref("");
const captureError = ref("");
const capturing = ref(false);
const pinned = ref(false);
const copied = ref(false);
const sourceExpanded = ref(true);
const translator = getTranslatorApi();
const { status, resultText, errorMessage, isRunning, start, stop, retry } = useTranslation();

const namingResult = computed<NamingResult | null>(() => {
  if (mode.value !== "naming" || status.value !== "success") return null;
  try { return JSON.parse(resultText.value) as NamingResult; } catch { return null; }
});
const displayResult = computed(() => namingResult.value?.recommended ?? resultText.value);

async function run(): Promise<void> {
  if (!sourceText.value.trim()) return;
  await start({
    text: sourceText.value,
    mode: mode.value,
    targetLanguage: mode.value === "naming" ? "en" : "auto",
    namingOptions: mode.value === "naming"
      ? { type: "variable", style: "camelCase", language: "general" }
      : undefined
  });
}

async function copy(text = displayResult.value): Promise<void> {
  if (!text) return;
  await translator.clipboard.writeText(text);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1000);
}

function close(): void { stop(); translator.window.closePopup(); }
function togglePin(): void { pinned.value = !pinned.value; translator.window.pinPopup(pinned.value); }
function openMain(): void { translator.window.openMain(mode.value === "naming" ? "/naming" : "/"); }
function handleKeydown(event: KeyboardEvent): void { if (event.key === "Escape") close(); }

let removePayloadListener: (() => void) | undefined;
onMounted(() => {
  document.addEventListener("keydown", handleKeydown);
  removePayloadListener = translator.window.onPopupPayload((payload) => {
    stop();
    mode.value = payload.mode;
    capturing.value = Boolean(payload.capturing);
    captureError.value = payload.error ?? "";
    if (payload.text) {
      sourceText.value = payload.text;
      capturing.value = false;
      void run();
    }
  });
});
onUnmounted(() => { document.removeEventListener("keydown", handleKeydown); removePayloadListener?.(); });
</script>

<template>
  <div class="popup-shell">
    <header class="popup-header drag-region">
      <div class="popup-tabs no-drag">
        <button :class="{ active: mode === 'normal' }" @click="mode = 'normal'; run()">翻译</button>
        <button :class="{ active: mode === 'technical' }" @click="mode = 'technical'; run()">技术</button>
        <button :class="{ active: mode === 'naming' }" @click="mode = 'naming'; run()">命名</button>
      </div>
      <div class="popup-window-actions no-drag"><button :title="pinned ? '取消固定' : '固定窗口'" @click="togglePin">{{ pinned ? '●' : '○' }}</button><button title="关闭 (Esc)" @click="close">×</button></div>
    </header>
    <section v-if="capturing" class="popup-state"><span class="spinner" />正在读取选中文字…</section>
    <section v-else-if="captureError" class="popup-manual"><p>{{ captureError }}</p><textarea v-model="sourceText" autofocus placeholder="在此粘贴或输入文本" @keydown.ctrl.enter.prevent="run" /><button class="primary-button" @click="run">开始处理</button></section>
    <template v-else>
      <section class="popup-source">
        <button class="source-toggle" @click="sourceExpanded = !sourceExpanded"><span>原文</span><span>{{ sourceExpanded ? '收起' : '展开' }}</span></button>
        <pre v-if="sourceExpanded">{{ sourceText }}</pre>
      </section>
      <section class="popup-result">
        <div v-if="status === 'loading'" class="popup-state"><span class="spinner" />正在等待模型响应…</div>
        <div v-else-if="status === 'error'" class="popup-error">{{ errorMessage }}</div>
        <div v-else-if="namingResult" class="popup-candidates"><button v-for="candidate in namingResult.candidates" :key="candidate.name" @click="copy(candidate.name)"><code>{{ candidate.name }}</code><small>{{ candidate.meaning }}</small></button></div>
        <pre v-else>{{ resultText }}<span v-if="status === 'streaming'" class="stream-cursor" /></pre>
      </section>
    </template>
    <footer class="popup-footer">
      <span class="popup-status">{{ copied ? '已复制' : status === 'success' ? '处理完成' : status === 'streaming' ? '生成中' : '' }}</span>
      <div><button v-if="isRunning" @click="stop">停止</button><button v-if="status === 'error'" @click="retry">重试</button><button :disabled="!displayResult" @click="copy()">复制</button><button @click="openMain">主窗口</button></div>
    </footer>
  </div>
</template>
