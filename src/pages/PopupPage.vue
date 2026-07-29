<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useTranslation } from "../composables/useTranslation";
import { useDictionary } from "../composables/useDictionary";
import type { NamingResult, TranslationMode, TranslationProfile } from "../../electron/shared/types";
import { shouldLookupDictionary } from "../../electron/shared/dictionary-eligibility";
import { getTranslatorApi } from "../platform/translator";
import SegmentedText from "../components/SegmentedText.vue";
import DictionaryCompactCard from "../components/dictionary/DictionaryCompactCard.vue";

type PopupView = "dictionary" | "normal" | "technical" | "naming";

const mode = ref<TranslationMode>("technical");
const popupView = ref<PopupView>("technical");
const sourceText = ref("");
const captureError = ref("");
const capturing = ref(false);
const pinned = ref(false);
const profiles = ref<TranslationProfile[]>([]);
const profileId = ref("technical");
const defaultTranslationProfileId = ref("technical");
const copied = ref(false);
const sourceExpanded = ref(true);
const translator = getTranslatorApi();
const { status, resultText, result, errorMessage, warningMessage, isRunning, start, stop, retry, reset } = useTranslation();
const { status: dictionaryStatus, result: dictionaryResult, lookupImmediate, reset: resetDictionary } = useDictionary(0);
const hoveredSegmentId = ref<string>();
const lockedSegmentId = ref<string>();
let payloadSequence = 0;

function syncProfileForMode(nextMode: TranslationMode, preferredProfileId?: string): void {
  if (nextMode === "naming") return;
  if (preferredProfileId) {
    profileId.value = preferredProfileId;
    return;
  }
  profileId.value = nextMode === "technical"
    ? (defaultTranslationProfileId.value || "technical")
    : "general";
}

function adaptHeightForView(view: PopupView): void {
  if (view === "dictionary") translator.window.adaptPopupHeight("dictionary");
  else if (view === "naming") translator.window.adaptPopupHeight("naming");
  else translator.window.adaptPopupHeight("translation");
}

const namingResult = computed<NamingResult | null>(() => {
  if (mode.value !== "naming" || status.value !== "success") return null;
  try { return JSON.parse(resultText.value) as NamingResult; } catch { return null; }
});
const displayResult = computed(() => namingResult.value?.recommended ?? resultText.value);
const activeSegmentId = computed(() => lockedSegmentId.value ?? hoveredSegmentId.value);
const hasStructuredResult = computed(() => status.value === "success" && Boolean(result.value?.segments.length));
const showDictionaryTab = computed(() => dictionaryStatus.value === "found" && Boolean(dictionaryResult.value?.entry));

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

async function selectView(view: PopupView): Promise<void> {
  popupView.value = view;
  adaptHeightForView(view);
  if (view === "dictionary") return;
  mode.value = view;
  syncProfileForMode(view);
  await run();
}

async function triggerAiTranslate(): Promise<void> {
  popupView.value = mode.value === "naming" ? "naming" : mode.value;
  await run();
}

async function handlePayloadText(text: string, preferredMode: TranslationMode, sequence: number): Promise<void> {
  sourceText.value = text;
  if (!shouldLookupDictionary(text)) {
    resetDictionary();
    popupView.value = preferredMode;
    mode.value = preferredMode;
    await run();
    return;
  }

  await lookupImmediate(text);
  if (sequence !== payloadSequence) return;

  if (dictionaryStatus.value === "found" && dictionaryResult.value?.entry) {
    popupView.value = "dictionary";
    return;
  }

  popupView.value = preferredMode;
  mode.value = preferredMode;
  await run();
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
  void translator.settings.get().then((settings) => {
    defaultTranslationProfileId.value = settings.shortcuts.defaultTranslationProfileId || "technical";
    profileId.value = defaultTranslationProfileId.value;
  }).catch(() => undefined);
  void translator.profiles.list().then((items) => { profiles.value = items; }).catch(() => undefined);
  removePayloadListener = translator.window.onPopupPayload((payload) => {
    const sequence = ++payloadSequence;
    stop();
    reset();
    resetDictionary();
    copied.value = false;
    mode.value = payload.mode;
    popupView.value = payload.mode;
    syncProfileForMode(payload.mode, payload.profileId);
    capturing.value = Boolean(payload.capturing);
    captureError.value = payload.error ?? "";
    hoveredSegmentId.value = undefined;
    lockedSegmentId.value = undefined;
    if (payload.text) {
      capturing.value = false;
      void handlePayloadText(payload.text, payload.mode, sequence);
    }
  });
});
onUnmounted(() => { document.removeEventListener("keydown", handleKeydown); removePayloadListener?.(); });
</script>

<template>
  <div class="popup-shell">
    <header class="popup-header drag-region">
      <div class="popup-tabs no-drag">
        <button v-if="showDictionaryTab" :class="{ active: popupView === 'dictionary' }" @click="selectView('dictionary')">词典</button>
        <button :class="{ active: popupView === 'normal' }" @click="selectView('normal')">翻译</button>
        <button :class="{ active: popupView === 'technical' }" @click="selectView('technical')">技术</button>
        <button :class="{ active: popupView === 'naming' }" @click="selectView('naming')">命名</button>
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
        <DictionaryCompactCard
          v-if="popupView === 'dictionary' && dictionaryResult?.entry"
          :entry="dictionaryResult.entry"
          @ai-translate="triggerAiTranslate"
        />
        <div v-else-if="status === 'loading'" class="popup-state"><span class="spinner" />正在等待模型响应…</div>
        <div v-else-if="status === 'error'" class="popup-error">{{ errorMessage }}</div>
        <template v-else-if="namingResult">
          <div v-if="warningMessage" class="popup-warning">{{ warningMessage }}</div>
          <div class="popup-candidates"><button v-for="candidate in namingResult.candidates" :key="candidate.name" @click="copy(candidate.name)"><code>{{ candidate.name }}</code><small>{{ candidate.meaning }}</small></button></div>
        </template>
        <template v-else-if="hasStructuredResult && result">
          <div v-if="warningMessage" class="popup-warning">{{ warningMessage }}</div>
          <SegmentedText
            side="target"
            :segments="result.segments"
            :active-id="activeSegmentId"
            @hover="handleSegmentHover"
            @toggle="toggleSegment"
            @clear="clearSegmentLock"
            @navigate="navigateSegment"
          />
        </template>
        <template v-else>
          <div v-if="warningMessage && displayResult" class="popup-warning">{{ warningMessage }}</div>
          <pre>{{ displayResult }}</pre>
        </template>
      </section>
    </template>
    <footer class="popup-footer">
      <span class="popup-status">{{ copied ? '已复制' : status === 'success' ? '处理完成' : status === 'streaming' ? '生成中' : showDictionaryTab && popupView === 'dictionary' ? '本地词典' : '' }}</span>
      <div>
        <button v-if="isRunning" @click="stop">停止</button>
        <button v-if="status === 'error'" @click="retry">重试</button>
        <button :disabled="!sourceText" title="复制原文" @click="copy(sourceText)">原文</button>
        <button :disabled="!sourceText || !displayResult" title="复制原文和译文" @click="copy(`原文：${sourceText}\n\n译文：${displayResult}`)">双语</button>
        <button :disabled="!displayResult" title="复制译文" @click="copy()">译文</button>
        <button @click="openMain">主窗口</button>
      </div>
    </footer>
  </div>
</template>
