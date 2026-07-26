<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useTranslation } from "../composables/useTranslation";
import type { NamingResult, TranslationMode, TranslationProfile } from "../../electron/shared/types";
import { getTranslatorApi } from "../platform/translator";
import SegmentedText from "../components/SegmentedText.vue";

const mode = ref<TranslationMode>("technical");
const sourceText = ref("");
const captureError = ref("");
const capturing = ref(false);
const pinned = ref(false);
const profiles = ref<TranslationProfile[]>([]);
const profileId = ref("general");
const copied = ref(false);
const sourceExpanded = ref(true);
const translator = getTranslatorApi();
const { status, resultText, result, errorMessage, isRunning, start, stop, retry } = useTranslation();
const hoveredSegmentId = ref<string>();
const lockedSegmentId = ref<string>();

const namingResult = computed<NamingResult | null>(() => {
  if (mode.value !== "naming" || status.value !== "success") return null;
  try { return JSON.parse(resultText.value) as NamingResult; } catch { return null; }
});
const displayResult = computed(() => namingResult.value?.recommended ?? resultText.value);
const activeSegmentId = computed(() => lockedSegmentId.value ?? hoveredSegmentId.value);
const hasStructuredResult = computed(() => status.value === "success" && Boolean(result.value?.segments.length));

async function run(): Promise<void> {
  if (!sourceText.value.trim()) return;
  hoveredSegmentId.value = undefined;
  lockedSegmentId.value = undefined;
  await start({
    text: sourceText.value,
    mode: mode.value,
    targetLanguage: mode.value === "naming" ? "en" : "auto",
    namingOptions: mode.value === "naming"
      ? { type: "variable", style: "camelCase", language: "general" }
      : undefined,
    profileId: profileId.value
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
function handleSegmentHover(id: string | undefined): void { if (!lockedSegmentId.value) hoveredSegmentId.value = id; }
function toggleSegment(id: string): void {
  lockedSegmentId.value = lockedSegmentId.value === id ? undefined : id;
  hoveredSegmentId.value = undefined;
}
function clearSegmentLock(): void { lockedSegmentId.value = undefined; hoveredSegmentId.value = undefined; }
function navigateSegment(id: string): void { lockedSegmentId.value = id; hoveredSegmentId.value = undefined; }

let removePayloadListener: (() => void) | undefined;
onMounted(() => {
  document.addEventListener("keydown", handleKeydown);
  void translator.profiles.list().then((items) => { profiles.value = items; }).catch(() => undefined);
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
      <label class="popup-profile no-drag">Profile<select v-model="profileId" @change="run"><option v-for="profile in profiles" :key="profile.id" :value="profile.id">{{ profile.name }}</option></select></label>
      <div class="popup-window-actions no-drag"><button :title="pinned ? '取消固定' : '固定窗口'" @click="togglePin">{{ pinned ? '●' : '○' }}</button><button title="关闭 (Esc)" @click="close">×</button></div>
    </header>
    <section v-if="capturing" class="popup-state"><span class="spinner" />正在读取选中文字…</section>
    <section v-else-if="captureError" class="popup-manual"><p>{{ captureError }}</p><textarea v-model="sourceText" autofocus placeholder="在此粘贴或输入文本" @keydown.ctrl.enter.prevent="run" /><button class="primary-button" @click="run">开始处理</button></section>
    <template v-else>
      <section class="popup-source">
        <button class="source-toggle" @click="sourceExpanded = !sourceExpanded"><span>原文</span><span>{{ sourceExpanded ? '收起' : '展开' }}</span></button>
        <SegmentedText
          v-if="sourceExpanded && hasStructuredResult && result"
          side="source"
          :segments="result.segments"
          :active-id="activeSegmentId"
          @hover="handleSegmentHover"
          @toggle="toggleSegment"
          @clear="clearSegmentLock"
          @navigate="navigateSegment"
        />
        <pre v-else-if="sourceExpanded">{{ sourceText }}</pre>
      </section>
      <section class="popup-result">
        <div v-if="status === 'loading'" class="popup-state"><span class="spinner" />正在等待模型响应…</div>
        <div v-else-if="status === 'error'" class="popup-error">{{ errorMessage }}</div>
        <div v-else-if="namingResult" class="popup-candidates"><button v-for="candidate in namingResult.candidates" :key="candidate.name" @click="copy(candidate.name)"><code>{{ candidate.name }}</code><small>{{ candidate.meaning }}</small></button></div>
        <SegmentedText
          v-else-if="hasStructuredResult && result"
          side="target"
          :segments="result.segments"
          :active-id="activeSegmentId"
          @hover="handleSegmentHover"
          @toggle="toggleSegment"
          @clear="clearSegmentLock"
          @navigate="navigateSegment"
        />
        <pre v-else>{{ resultText }}<span v-if="status === 'streaming'" class="stream-cursor" /></pre>
      </section>
    </template>
    <footer class="popup-footer">
      <span class="popup-status">{{ copied ? '已复制' : status === 'success' ? '处理完成' : status === 'streaming' ? '生成中' : '' }}</span>
      <div><button v-if="isRunning" @click="stop">停止</button><button v-if="status === 'error'" @click="retry">重试</button><button :disabled="!sourceText" title="复制原文" @click="copy(sourceText)">原文</button><button :disabled="!sourceText || !displayResult" title="复制原文和译文" @click="copy(`原文：${sourceText}\n\n译文：${displayResult}`)">双语</button><button :disabled="!displayResult" title="复制译文" @click="copy()">译文</button><button @click="openMain">主窗口</button></div>
    </footer>
  </div>
</template>
