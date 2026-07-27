<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import PageHeader from "../components/PageHeader.vue";
import ResultPanel from "../components/ResultPanel.vue";
import SegmentedText from "../components/SegmentedText.vue";
import AppIcon from "../components/AppIcon.vue";
import DictionaryCard from "../components/dictionary/DictionaryCard.vue";
import { useTranslation } from "../composables/useTranslation";
import { useDictionary } from "../composables/useDictionary";
import type { DictionaryLookupResult, OcrResult, OcrScreen, SegmentAlternative, SegmentRevision, TargetLanguage, TranslationMode, TranslationProfile, TranslationQualityIssue, TranslationSegment } from "../../electron/shared/types";
import { pickTargetDictionaryQuery, shouldLookupDictionary } from "../../electron/shared/dictionary-eligibility";
import { getTranslatorApi } from "../platform/translator";
import { checkTranslationQuality } from "../../electron/shared/quality";

type ResultView = "dictionary" | "translation";

const sourceText = ref("");
const mode = ref<TranslationMode>("normal");
const targetLanguage = ref<TargetLanguage>("auto");
const copied = ref(false);
const translator = getTranslatorApi();
const maxInputLength = ref(10_000);
const providerLabel = ref("本地模型");
const profiles = ref<TranslationProfile[]>([]);
const profileId = ref("general");
const { status, resultText, result, errorMessage, isRunning, start, stop, retry, reset } = useTranslation();
const { status: dictionaryStatus, result: autoDictionaryResult, lookup: lookupAutoDictionary, reset: resetAutoDictionary } = useDictionary(220);
const resultView = ref<ResultView>("translation");
const lastTranslatedSource = ref("");
const hoveredSegmentId = ref<string>();
const lockedSegmentId = ref<string>();
const sourceEditorVisible = ref(true);
const sourceTextarea = ref<HTMLTextAreaElement>();
const segmentDictionary = ref<DictionaryLookupResult | null>(null);
const dictionaryTerm = ref("");
const dictionaryLoading = ref(false);
const dictionaryError = ref("");
const dictionarySegmentId = ref<string>();
const dictionaryCard = ref<HTMLElement>();
const dictionaryContextText = ref("");
const dictionaryContextError = ref("");
const dictionaryContextLoading = ref(false);
const dictionaryContextRequestId = ref<string>();
const revisions = ref<SegmentRevision[]>([]);
const revisionStatus = ref<"idle" | "loading" | "error">("idle");
const revisionError = ref("");
const revisionNotice = ref("");
const customRevisionInstruction = ref("");
const revisionRequestId = ref<string>();
const alternatives = ref<SegmentAlternative[]>([]);
const alternativesLoading = ref(false);
const alternativesRequestId = ref<string>();
const qualityIssues = ref<TranslationQualityIssue[]>([]);
const ocrResult = ref<OcrResult>();
const ocrLoading = ref(false);
const ocrError = ref("");
const ocrScreens = ref<OcrScreen[]>([]);
const ocrScreenId = ref<string>();
const ocrImage = ref<HTMLElement>();
const ocrSelection = ref<{ startX: number; startY: number; endX: number; endY: number }>();
const selectingOcr = ref(false);
const ocrEditedText = ref("");
const glossaryFromDictionary = ref({ sourceTerm: "", targetTerm: "" });
const glossaryFromDictionaryNotice = ref("");
const activeSegmentId = computed(() => lockedSegmentId.value ?? hoveredSegmentId.value);
const hasStructuredResult = computed(() => status.value === "success" && Boolean(result.value?.segments.length));
const displaySegments = computed<TranslationSegment[]>(() => (result.value?.segments ?? []).map((segment) => {
  const revision = [...revisions.value].reverse().find((item) => item.segmentId === segment.id);
  return revision ? { ...segment, target: revision.newTarget } : segment;
}));
const displayResultText = computed(() => displaySegments.value.length ? displaySegments.value.map((segment) => segment.target).join("\n") : resultText.value);
const lockedSegment = computed(() => displaySegments.value.find((segment) => segment.id === lockedSegmentId.value));
const dictionaryContext = computed(() => displaySegments.value.find((segment) => segment.id === dictionarySegmentId.value));
const glossaryValidation = computed(() => result.value?.glossaryValidation ?? []);
const dictionaryEligible = computed(() => shouldLookupDictionary(sourceText.value));
const showDictionaryPane = computed(() => dictionaryEligible.value && dictionaryStatus.value === "found" && Boolean(autoDictionaryResult.value?.entry));
const showDictionaryTab = computed(() => dictionaryEligible.value);
const primaryActionLabel = computed(() => (showDictionaryPane.value && resultView.value === "dictionary" ? "AI 翻译" : "开始翻译"));
const showRevisionPopover = computed(() => Boolean(lockedSegment.value && hasStructuredResult.value));
const showMainDictionary = computed(() => showDictionaryPane.value && resultView.value === "dictionary");

function resizeSourceTextarea(): void {
  const el = sourceTextarea.value;
  if (!el) return;
  el.style.height = "0px";
  el.style.height = `${el.scrollHeight}px`;
}

watch(sourceText, (value) => {
  if (lastTranslatedSource.value && value !== lastTranslatedSource.value) {
    reset();
    lastTranslatedSource.value = "";
    closeDictionary();
  }
  void nextTick(resizeSourceTextarea);
  if (!shouldLookupDictionary(value)) {
    resetAutoDictionary();
    resultView.value = "translation";
    return;
  }
  lookupAutoDictionary(value);
});

watch(dictionaryStatus, (value) => {
  if (!dictionaryEligible.value) {
    resultView.value = "translation";
    return;
  }
  if (value === "found") resultView.value = "dictionary";
  else if (resultView.value === "dictionary") resultView.value = "translation";
});

watch(status, (value) => {
  if (value !== "success") return;
  const query = pickTargetDictionaryQuery(displaySegments.value, displayResultText.value);
  if (!query) return;
  void lookupDictionary(query);
});

watch(sourceEditorVisible, (visible) => {
  if (visible) void nextTick(resizeSourceTextarea);
});

async function translate(): Promise<void> {
  sourceEditorVisible.value = false;
  hoveredSegmentId.value = undefined;
  lockedSegmentId.value = undefined;
  revisions.value = [];
  alternatives.value = [];
  closeDictionary();
  resultView.value = "translation";
  lastTranslatedSource.value = sourceText.value;
  await start({ text: sourceText.value, mode: mode.value, targetLanguage: targetLanguage.value, profileId: profileId.value });
}

async function triggerAiTranslate(): Promise<void> {
  resultView.value = "translation";
  if (lastTranslatedSource.value === sourceText.value && (status.value === "success" || status.value === "streaming" || status.value === "loading")) {
    return;
  }
  await translate();
}

async function switchResultView(view: ResultView): Promise<void> {
  if (view === "dictionary") {
    if (!showDictionaryPane.value) return;
    resultView.value = "dictionary";
    return;
  }
  await triggerAiTranslate();
}
async function reviseSegment(instruction: string): Promise<void> {
  const segment = lockedSegment.value;
  if (!segment || revisionStatus.value === "loading") return;
  revisionStatus.value = "loading";
  revisionError.value = "";
  revisionNotice.value = "";
  revisionRequestId.value = await translator.revision.start({
    segment,
    instruction,
    targetLanguage: targetLanguage.value,
    profileId: profileId.value
  });
}
async function addActiveSegmentToGlossary(): Promise<void> {
  const segment = lockedSegment.value;
  if (!segment) return;
  try {
    const now = Date.now();
    await translator.glossary.upsert({ id: crypto.randomUUID(), sourceTerm: segment.source, targetTerm: segment.target, sourceLanguage: "auto", targetLanguage: result.value?.targetLanguage ?? targetLanguage.value, domain: "翻译结果", caseSensitive: false, matchMode: "phrase", enabled: true, createdAt: now, updatedAt: now });
    revisionError.value = "";
    revisionNotice.value = "已将当前句段加入本地术语表。";
  } catch (error) { revisionNotice.value = ""; revisionError.value = error instanceof Error ? error.message : "加入术语表失败。"; }
}
async function addDictionaryTermToGlossary(): Promise<void> {
  const sourceTerm = glossaryFromDictionary.value.sourceTerm.trim() || dictionaryTerm.value;
  const targetTerm = glossaryFromDictionary.value.targetTerm.trim();
  if (!sourceTerm || !targetTerm) {
    glossaryFromDictionaryNotice.value = "请确认源词和目标词后再加入术语表。";
    return;
  }
  try {
    const now = Date.now();
    await translator.glossary.upsert({
      id: crypto.randomUUID(),
      sourceTerm,
      targetTerm,
      sourceLanguage: "auto",
      targetLanguage: result.value?.targetLanguage ?? targetLanguage.value,
      domain: "词典",
      caseSensitive: false,
      matchMode: "word",
      enabled: true,
      createdAt: now,
      updatedAt: now
    });
    glossaryFromDictionaryNotice.value = "已加入本地术语表。";
  } catch (error) {
    glossaryFromDictionaryNotice.value = error instanceof Error ? error.message : "加入术语表失败。";
  }
}
async function reviseWithCustomInstruction(): Promise<void> {
  const instruction = customRevisionInstruction.value.trim();
  if (!instruction) { revisionError.value = "请输入自定义要求或指定词语。"; return; }
  await reviseSegment(instruction);
}
function undoRevision(): void {
  const segmentId = lockedSegmentId.value;
  if (!segmentId) return;
  const index = [...revisions.value].map((item) => item.segmentId).lastIndexOf(segmentId);
  if (index >= 0) revisions.value.splice(index, 1);
}
async function requestAlternatives(): Promise<void> {
  if (!lockedSegment.value || alternativesLoading.value) return;
  alternatives.value = [];
  alternativesLoading.value = true;
  alternativesRequestId.value = await translator.alternatives.start({
    segment: lockedSegment.value,
    targetLanguage: targetLanguage.value,
    profileId: profileId.value
  });
}
function applyAlternative(alternative: SegmentAlternative): void {
  const segment = lockedSegment.value;
  if (!segment) return;
  revisions.value.push({ id: alternative.id, segmentId: segment.id, previousTarget: segment.target, newTarget: alternative.target, instruction: alternative.label, createdAt: Date.now() });
  alternatives.value = [];
}
function runQualityCheck(): void { qualityIssues.value = checkTranslationQuality(displaySegments.value, { targetLanguage: result.value?.targetLanguage, glossaryValidation: glossaryValidation.value }); }
async function captureOcr(): Promise<void> { ocrLoading.value = true; ocrError.value = ""; try { const captured = await translator.ocr.captureScreen(ocrScreenId.value); ocrResult.value = captured; ocrEditedText.value = captured.text; sourceText.value = captured.text; sourceEditorVisible.value = true; } catch (error) { ocrError.value = error instanceof Error ? error.message : "OCR 识别失败。"; } finally { ocrLoading.value = false; } }
function useOcrBlock(text: string): void { sourceText.value = text; ocrEditedText.value = text; sourceEditorVisible.value = true; }
function applyOcrEditedText(): void {
  if (!ocrEditedText.value.trim()) return;
  sourceText.value = ocrEditedText.value;
  sourceEditorVisible.value = true;
}
async function copyOcrText(): Promise<void> {
  if (!ocrResult.value?.text) return;
  await translator.clipboard.writeText(ocrResult.value.text);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1200);
}
function pointInOcrImage(event: PointerEvent): { x: number; y: number } | undefined {
  const bounds = ocrImage.value?.getBoundingClientRect();
  if (!bounds || !bounds.width || !bounds.height) return undefined;
  return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) };
}
function beginOcrSelection(event: PointerEvent): void { const point = pointInOcrImage(event); if (!point) return; selectingOcr.value = true; ocrSelection.value = { startX: point.x, startY: point.y, endX: point.x, endY: point.y }; ocrImage.value?.setPointerCapture(event.pointerId); }
function moveOcrSelection(event: PointerEvent): void { if (!selectingOcr.value || !ocrSelection.value) return; const point = pointInOcrImage(event); if (point) { ocrSelection.value.endX = point.x; ocrSelection.value.endY = point.y; } }
function endOcrSelection(event: PointerEvent): void {
  if (!selectingOcr.value || !ocrSelection.value || !ocrResult.value) return;
  selectingOcr.value = false;
  const point = pointInOcrImage(event); if (point) { ocrSelection.value.endX = point.x; ocrSelection.value.endY = point.y; }
  const selection = ocrSelection.value;
  if (Math.abs(selection.endX - selection.startX) < 0.01 || Math.abs(selection.endY - selection.startY) < 0.01) { ocrSelection.value = undefined; return; }
  const left = Math.min(selection.startX, selection.endX) * ocrResult.value.imageWidth;
  const right = Math.max(selection.startX, selection.endX) * ocrResult.value.imageWidth;
  const top = Math.min(selection.startY, selection.endY) * ocrResult.value.imageHeight;
  const bottom = Math.max(selection.startY, selection.endY) * ocrResult.value.imageHeight;
  const text = ocrResult.value.blocks.filter((block) => {
    const centerX = block.boundingBox.x + block.boundingBox.width / 2;
    const centerY = block.boundingBox.y + block.boundingBox.height / 2;
    return centerX >= left && centerX <= right && centerY >= top && centerY <= bottom;
  }).map((block) => block.text).join("\n");
  if (text) useOcrBlock(text);
}
const ocrSelectionStyle = computed(() => {
  const value = ocrSelection.value; if (!value) return undefined;
  const left = Math.min(value.startX, value.endX); const top = Math.min(value.startY, value.endY);
  return { left: `${left * 100}%`, top: `${top * 100}%`, width: `${Math.abs(value.endX - value.startX) * 100}%`, height: `${Math.abs(value.endY - value.startY) * 100}%` };
});

function handleSegmentHover(id: string | undefined): void {
  if (!lockedSegmentId.value) hoveredSegmentId.value = id;
}

function toggleSegment(id: string): void {
  lockedSegmentId.value = lockedSegmentId.value === id ? undefined : id;
  hoveredSegmentId.value = undefined;
}

function clearSegmentLock(): void {
  lockedSegmentId.value = undefined;
  hoveredSegmentId.value = undefined;
}
function closeDictionary(): void {
  translator.dictionary.context.cancel(dictionaryContextRequestId.value);
  dictionaryTerm.value = "";
  segmentDictionary.value = null;
  dictionaryError.value = "";
  dictionarySegmentId.value = undefined;
  dictionaryContextText.value = "";
  dictionaryContextError.value = "";
  dictionaryContextLoading.value = false;
  dictionaryContextRequestId.value = undefined;
}

function navigateSegment(id: string): void {
  lockedSegmentId.value = id;
  hoveredSegmentId.value = undefined;
}
async function lookupDictionary(term: string, segmentId?: string): Promise<void> {
  translator.dictionary.context.cancel(dictionaryContextRequestId.value);
  dictionaryTerm.value = term;
  dictionarySegmentId.value = segmentId;
  segmentDictionary.value = null;
  dictionaryError.value = "";
  dictionaryContextText.value = "";
  dictionaryContextError.value = "";
  dictionaryContextLoading.value = false;
  dictionaryContextRequestId.value = undefined;
  if (segmentId) {
    lockedSegmentId.value = segmentId;
    hoveredSegmentId.value = undefined;
  }
  dictionaryLoading.value = true;
  try {
    const lookup = await translator.dictionary.lookup({ query: term });
    segmentDictionary.value = lookup;
    const firstSense = lookup.entry?.senses[0]?.translations[0] ?? "";
    glossaryFromDictionary.value = {
      sourceTerm: term,
      targetTerm: firstSense.split(/[；;，,]/)[0]?.trim() ?? ""
    };
    glossaryFromDictionaryNotice.value = "";
    const profile = profiles.value.find((candidate) => candidate.id === profileId.value);
    const context = dictionaryContext.value;
    if (lookup.found && context && profile?.dictionaryMode === "contextual") {
      dictionaryContextLoading.value = true;
      dictionaryContextRequestId.value = await translator.dictionary.context.start({
        term,
        source: context.source,
        target: context.target,
        targetLanguage: targetLanguage.value,
        profileId: profileId.value
      });
    }
  } catch (error) {
    dictionaryError.value = error instanceof Error ? error.message : "本地词典暂时不可用。";
  } finally {
    dictionaryLoading.value = false;
  }
}

async function copyResult(): Promise<void> {
  if (!resultText.value) return;
  await translator.clipboard.writeText(displayResultText.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1200);
}
async function copySource(): Promise<void> {
  if (!sourceText.value) return;
  await translator.clipboard.writeText(sourceText.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1200);
}
async function copyBilingual(): Promise<void> {
  if (!sourceText.value || !displayResultText.value) return;
  await translator.clipboard.writeText(`原文：${sourceText.value}\n\n译文：${displayResultText.value}`);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1200);
}

onMounted(async () => {
  void nextTick(resizeSourceTextarea);
  const settings = await translator.settings.get();
  maxInputLength.value = settings.translation.maxInputLength;
  targetLanguage.value = settings.translation.targetLanguage;
  providerLabel.value = settings.provider.type === "ollama" ? "本地模型" : "远程模型";
  profiles.value = await translator.profiles.list();
  try { ocrScreens.value = await translator.ocr.listScreens(); ocrScreenId.value = ocrScreens.value.find((item) => item.primary)?.id ?? ocrScreens.value[0]?.id; } catch { ocrScreens.value = []; }

  const pending = sessionStorage.getItem("lexiflow:retranslate");
  if (!pending) return;
  sessionStorage.removeItem("lexiflow:retranslate");
  try {
    const history = JSON.parse(pending) as { sourceText: string; mode: TranslationMode; targetLanguage: TargetLanguage };
    sourceText.value = history.sourceText;
    mode.value = history.mode === "naming" ? "normal" : history.mode;
    targetLanguage.value = history.targetLanguage;
    void nextTick(resizeSourceTextarea);
  } catch {
    // Ignore malformed session data; it should never block the translation page.
  }
});

const removeRevisionListener = translator.revision.onEvent((event) => {
  if (revisionRequestId.value && event.requestId !== revisionRequestId.value) return;
  if (event.status === "loading") revisionStatus.value = "loading";
  if (event.status === "success" && event.revision) {
    revisions.value.push(event.revision);
    revisionStatus.value = "idle";
    revisionRequestId.value = undefined;
  }
  if (event.status === "error" || event.status === "cancelled") {
    revisionStatus.value = "error";
    revisionError.value = event.error ?? "局部重译失败。";
    revisionRequestId.value = undefined;
  }
});
onUnmounted(() => {
  removeRevisionListener();
});
const removeAlternativesListener = translator.alternatives.onEvent((event) => {
  if (alternativesRequestId.value && event.requestId !== alternativesRequestId.value) return;
  alternativesLoading.value = event.status === "loading";
  if (event.status === "success") { alternatives.value = event.alternatives ?? []; alternativesLoading.value = false; alternativesRequestId.value = undefined; }
  if (event.status === "error" || event.status === "cancelled") { alternativesLoading.value = false; alternativesRequestId.value = undefined; }
});
onUnmounted(() => removeAlternativesListener());
const removeOcrCaptureListener = translator.ocr.onCaptureRequested(() => { void captureOcr(); });
onUnmounted(() => removeOcrCaptureListener());
const removeDictionaryContextListener = translator.dictionary.context.onEvent((event) => {
  if (dictionaryContextRequestId.value && event.requestId !== dictionaryContextRequestId.value) return;
  dictionaryContextLoading.value = event.status === "loading";
  if (event.status === "success") {
    dictionaryContextText.value = event.explanation ?? "";
    dictionaryContextLoading.value = false;
    dictionaryContextRequestId.value = undefined;
  }
  if (event.status === "error" || event.status === "cancelled") {
    dictionaryContextError.value = event.error ?? "上下文解释暂不可用。";
    dictionaryContextLoading.value = false;
    dictionaryContextRequestId.value = undefined;
  }
});
onUnmounted(() => {
  translator.dictionary.context.cancel(dictionaryContextRequestId.value);
  removeDictionaryContextListener();
});
</script>

<template>
  <div class="page translation-page">
    <PageHeader title="翻译" class="translation-header">
      <template #leading>
        <div class="segmented">
          <button :class="{ active: mode === 'normal' }" @click="mode = 'normal'">普通翻译</button>
          <button :class="{ active: mode === 'technical' }" @click="mode = 'technical'">技术翻译</button>
        </div>
      </template>
      <div class="control-inline">
        <label>目标语言
          <select v-model="targetLanguage"><option value="auto">自动识别</option><option value="zh-CN">中文</option><option value="en">英文</option></select>
        </label>
        <label>Profile<select v-model="profileId"><option v-for="profile in profiles" :key="profile.id" :value="profile.id">{{ profile.name }}</option></select></label>
      </div>
      <select v-if="ocrScreens.length" v-model="ocrScreenId" class="ocr-screen-select" title="选择 OCR 截图屏幕"><option v-for="screen in ocrScreens" :key="screen.id" :value="screen.id">{{ screen.primary ? '主屏 · ' : '' }}{{ screen.name }}（{{ screen.width }}×{{ screen.height }}）</option></select><button class="text-button" :disabled="ocrLoading" @click="captureOcr">{{ ocrLoading ? 'OCR 识别中' : 'OCR 截图' }}</button><button v-if="hasStructuredResult" class="text-button" @click="runQualityCheck">质量检查</button><span v-if="copied" class="success-badge"><AppIcon name="check" :size="14" />已复制</span>
      <span v-else class="status-chip">{{ providerLabel }}</span>
    </PageHeader>
    <section v-if="ocrResult || ocrError" class="ocr-card surface">
      <div class="panel-toolbar">
        <span>OCR 结果</span>
        <div>
          <button v-if="ocrResult" class="text-button" :disabled="ocrLoading" @click="captureOcr">重新识别</button>
          <button v-if="ocrResult" class="text-button" @click="copyOcrText">复制原文</button>
          <button v-if="ocrResult" class="text-button" @click="ocrResult = undefined; ocrSelection = undefined; ocrEditedText = ''">关闭</button>
        </div>
      </div>
      <div v-if="ocrError" class="error-message">{{ ocrError }}</div>
      <div v-else-if="ocrResult" class="ocr-preview">
        <p>第一阶段：先选屏幕，再在预览中框选文本块。暂不支持原生跨屏一次框选；截图仅保存在内存，临时 PNG 识别后立即删除。</p>
        <div ref="ocrImage" class="ocr-image" @pointerdown="beginOcrSelection" @pointermove="moveOcrSelection" @pointerup="endOcrSelection" @pointercancel="selectingOcr = false">
          <img :src="ocrResult.imageDataUrl" alt="OCR 截图预览" draggable="false" />
          <span v-if="ocrSelectionStyle" class="ocr-selection" :style="ocrSelectionStyle" />
          <button v-for="block in ocrResult.blocks" :key="block.id" class="ocr-block" :style="{ left: `${block.boundingBox.x / ocrResult.imageWidth * 100}%`, top: `${block.boundingBox.y / ocrResult.imageHeight * 100}%`, width: `${block.boundingBox.width / ocrResult.imageWidth * 100}%`, height: `${block.boundingBox.height / ocrResult.imageHeight * 100}%` }" :title="block.text" @pointerdown.stop @click.stop="useOcrBlock(block.text)" />
        </div>
        <label class="wide-field">识别文本（可编辑）<textarea v-model="ocrEditedText" rows="4" /></label>
        <div class="form-actions"><button class="secondary-button" @click="applyOcrEditedText">用编辑后的文本翻译</button></div>
      </div>
    </section>
    <div class="translation-stack">
      <section class="input-panel surface">
        <div class="panel-toolbar"><span>原文</span><button class="text-button" @click="hasStructuredResult ? sourceEditorVisible = true : sourceText = ''">{{ hasStructuredResult ? '编辑原文' : '清空' }}</button></div>
        <div class="source-body">
          <SegmentedText
            v-if="hasStructuredResult && !sourceEditorVisible && result"
            side="source"
            :segments="displaySegments"
            :active-id="activeSegmentId"
            @hover="handleSegmentHover"
            @toggle="toggleSegment"
            @clear="clearSegmentLock"
            @navigate="navigateSegment"
            @select-term="lookupDictionary"
          />
          <textarea
            v-else
            ref="sourceTextarea"
            v-model="sourceText"
            autofocus
            rows="1"
            placeholder="输入或粘贴文本，Ctrl + Enter 执行"
            @input="resizeSourceTextarea"
            @keydown.ctrl.enter.prevent="translate"
          />
        </div>
        <div class="input-footer"><span>{{ sourceText.length.toLocaleString() }} / {{ maxInputLength.toLocaleString() }}</span><button class="primary-button" :disabled="isRunning" @click="triggerAiTranslate">{{ primaryActionLabel }}</button></div>
      </section>
      <section class="result-stack surface">
        <div class="panel-toolbar result-view-tabs">
          <div class="segmented" :title="showDictionaryTab ? undefined : '本地词典仅支持短英文词'">
            <button :class="{ active: showMainDictionary }" :disabled="!showDictionaryTab" @click="switchResultView('dictionary')">词典</button>
            <button :class="{ active: !showMainDictionary }" @click="switchResultView('translation')">AI 翻译</button>
          </div>
        </div>
        <div class="result-stack-body">
          <template v-if="showMainDictionary">
            <DictionaryCard
              v-if="autoDictionaryResult?.entry"
              :entry="autoDictionaryResult.entry"
              @ai-translate="triggerAiTranslate"
            />
          </template>
          <template v-else>
            <p v-if="dictionaryStatus === 'not-found' && dictionaryEligible" class="dictionary-hint muted">本地词典未收录，将使用模型翻译。</p>
            <p v-else-if="dictionaryStatus === 'unavailable'" class="dictionary-hint muted">{{ autoDictionaryResult?.unavailableReason || '本地词典资源不可用，仍可使用 AI 翻译。' }}</p>
            <ResultPanel
              :status="status"
              :text="displayResultText"
              :source-text="sourceText"
              :error="errorMessage"
              :segments="displaySegments"
              :active-segment-id="activeSegmentId"
              @copy="copyResult"
              @copy-source="copySource"
              @copy-bilingual="copyBilingual"
              @stop="stop"
              @retry="retry"
              @hover="handleSegmentHover"
              @toggle="toggleSegment"
              @clear="clearSegmentLock"
              @navigate="navigateSegment"
              @select-term="lookupDictionary"
            />
          </template>
          <section v-if="dictionaryTerm" ref="dictionaryCard" class="dictionary-card surface" aria-live="polite">
            <div class="panel-toolbar"><span>词典 · {{ dictionaryTerm }}</span><button class="text-button" @click="closeDictionary">关闭</button></div>
            <div v-if="dictionaryLoading" class="state-message muted"><span class="spinner" />正在查询本地词典</div>
            <div v-else-if="segmentDictionary?.entry" class="dictionary-content">
              <DictionaryCard :entry="segmentDictionary.entry" @ai-translate="triggerAiTranslate" />
              <div v-if="dictionaryContext" class="dictionary-context"><small>当前双语上下文</small><p>{{ dictionaryContext.source }}</p><p>{{ dictionaryContext.target }}</p></div>
              <div v-if="dictionaryContextLoading || dictionaryContextText || dictionaryContextError" class="dictionary-context"><small>模型补充解释</small><p v-if="dictionaryContextLoading" class="muted">正在补充释义…</p><p v-else-if="dictionaryContextText">{{ dictionaryContextText }}</p><p v-else class="error-text">{{ dictionaryContextError }}</p></div>
              <div class="dictionary-glossary">
                <small>加入术语表前请确认源词与目标词（不要直接把整段释义当译文）</small>
                <div class="form-grid">
                  <label>源词<input v-model="glossaryFromDictionary.sourceTerm" /></label>
                  <label>目标词<input v-model="glossaryFromDictionary.targetTerm" placeholder="固定译法" /></label>
                </div>
                <button class="secondary-button" @click="addDictionaryTermToGlossary">加入术语表</button>
                <small v-if="glossaryFromDictionaryNotice" class="muted">{{ glossaryFromDictionaryNotice }}</small>
              </div>
            </div>
            <div v-else-if="dictionaryError" class="state-message error-message">{{ dictionaryError }}</div>
            <div v-else class="state-message muted">{{ segmentDictionary?.unavailableReason || '本地词典暂未收录该词或短语。' }}</div>
          </section>
        </div>
        <section v-if="showRevisionPopover" class="revision-popover surface">
          <div class="panel-toolbar">
            <span>局部重译</span>
            <div>
              <button class="text-button" :disabled="alternativesLoading" @click="requestAlternatives">{{ alternativesLoading ? '生成候选中' : '候选译法' }}</button>
              <button class="text-button" @click="addActiveSegmentToGlossary">加入术语表</button>
              <button class="text-button" :disabled="!revisions.some((item) => item.segmentId === lockedSegment?.id)" @click="undoRevision">撤销本句修改</button>
              <button class="text-button" @click="clearSegmentLock">关闭</button>
            </div>
          </div>
          <p>仅向模型发送当前句段。选择一种调整方式：</p>
          <div class="revision-actions"><button v-for="instruction in ['更自然', '更正式', '更简洁', '更口语', '更直译', '保持原句结构']" :key="instruction" class="secondary-button" :disabled="revisionStatus === 'loading'" @click="reviseSegment(instruction)">{{ instruction }}</button></div>
          <div class="revision-custom"><input v-model="customRevisionInstruction" :disabled="revisionStatus === 'loading'" placeholder="自定义要求，或指定词语，例如：使用“接口”表达" @keydown.enter.prevent="reviseWithCustomInstruction" /><button class="secondary-button" :disabled="revisionStatus === 'loading'" @click="reviseWithCustomInstruction">按要求重译</button></div>
          <div v-if="alternatives.length" class="alternative-list"><button v-for="alternative in alternatives" :key="alternative.id" @click="applyAlternative(alternative)"><strong>{{ alternative.label }}</strong><span>{{ alternative.target }}</span><small>{{ alternative.description }}</small></button></div>
          <small v-if="revisionStatus === 'loading'" class="muted">正在重新表达当前句段…</small><small v-else-if="revisionError" class="error-text">{{ revisionError }}</small><small v-else-if="revisionNotice" class="muted">{{ revisionNotice }}</small>
        </section>
      </section>
    </div>
    <section v-if="qualityIssues.length" class="quality-card surface"><div class="panel-toolbar"><span>质量检查</span><button class="text-button" @click="qualityIssues = []">关闭</button></div><ul><li v-for="issue in qualityIssues" :key="`${issue.segmentId}-${issue.kind}`">{{ issue.message }}</li></ul></section>
    <section v-if="glossaryValidation.length" class="quality-card surface"><div class="panel-toolbar"><span>术语校验</span><small>{{ glossaryValidation.filter((item) => item.applied).length }} / {{ glossaryValidation.length }} 已按术语表使用</small></div><ul><li v-for="item in glossaryValidation" :key="item.sourceTerm" :class="item.applied ? 'glossary-valid' : 'glossary-invalid'">{{ item.applied ? '✓' : '!' }} {{ item.sourceTerm }} → {{ item.targetTerm }}{{ item.applied ? '' : '（译文中未检测到）' }}</li></ul></section>
  </div>
</template>
