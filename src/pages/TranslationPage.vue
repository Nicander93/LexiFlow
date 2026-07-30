<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type Ref } from "vue";
import PageHeader from "../components/PageHeader.vue";
import ResultPanel from "../features/translation/components/ResultPanel.vue";
import AppIcon from "../components/AppIcon.vue";
import DictionaryCard from "../features/dictionary/components/DictionaryCard.vue";
import { useTranslation } from "../features/translation/useTranslation";
import { useDictionary } from "../features/dictionary/useDictionary";
import { useOcrCapture } from "../features/ocr/useOcrCapture";
import { useSegmentRevision } from "../features/translation/useSegmentRevision";
import type { DictionaryLookupResult, SegmentRevision, TargetLanguage, TranslationMode, TranslationProfile, TranslationSegment } from "../../electron/shared/types";
import { pickTargetDictionaryQuery, shouldLookupDictionary } from "../../electron/shared/dictionary-eligibility";
import { getTranslatorApi } from "../platform/translator";

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
const PROFILE_SHORTCUTS = [
  { id: "general", label: "通用" },
  { id: "technical", label: "技术" },
  { id: "academic", label: "学术" }
] as const;

function selectProfileShortcut(id: string): void {
  profileId.value = id;
  mode.value = id === "technical" || id === "code-comment" ? "technical" : "normal";
}

function onProfileChange(): void {
  mode.value = profileId.value === "technical" || profileId.value === "code-comment" ? "technical" : "normal";
}

const { status, resultText, result, errorMessage, warningMessage, historyId, isRunning, start, stop, retry, reset } = useTranslation();
const showOriginalText = ref(false);
const cleanupDismissed = ref(false);
const cleanupNotice = computed(() => {
  if (cleanupDismissed.value || !result.value?.cleanupActions?.length) return "";
  return result.value.cleanupActions.find((item) => item.type === "remove-soft-wraps")?.description
    ?? result.value.cleanupActions[0]?.description
    ?? "已自动整理原文";
});
const { status: dictionaryStatus, result: autoDictionaryResult, lookup: lookupAutoDictionary, reset: resetAutoDictionary } = useDictionary(220);
const resultView = ref<ResultView>("translation");
const lastTranslatedSource = ref("");
const hoveredSegmentId = ref<string>();
const lockedSegmentId = ref<string>();
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
const glossaryFromDictionary = ref({ sourceTerm: "", targetTerm: "" });
const glossaryFromDictionaryNotice = ref("");

let revisions!: Ref<SegmentRevision[]>;
const displaySegments = computed<TranslationSegment[]>(() => (result.value?.segments ?? []).map((segment) => {
  const revision = [...revisions.value].reverse().find((item) => item.segmentId === segment.id);
  return revision ? { ...segment, target: revision.newTarget } : segment;
}));
const displayResultText = computed(() => displaySegments.value.length ? displaySegments.value.map((segment) => segment.target).join("\n") : resultText.value);
const lockedSegment = computed(() => displaySegments.value.find((segment) => segment.id === lockedSegmentId.value));

const {
  revisions: revisionsFromComposable,
  revisionStatus,
  revisionError,
  revisionNotice,
  customRevisionInstruction,
  alternatives,
  alternativesLoading,
  reviseSegment,
  reviseWithCustomInstruction,
  undoRevision,
  requestAlternatives,
  applyAlternative,
  clearRevisions
} = useSegmentRevision({ lockedSegment, lockedSegmentId, historyId, targetLanguage, profileId, displayResultText });
revisions = revisionsFromComposable;

function markCopied(): void {
  copied.value = true;
  setTimeout(() => (copied.value = false), 1200);
}

const {
  ocrResult,
  ocrLoading,
  ocrError,
  ocrScreenId,
  ocrImage,
  ocrSelection,
  selectingOcr,
  ocrEditedText,
  ocrSelectionStyle,
  captureOcr,
  useOcrBlock,
  applyOcrEditedText,
  copyOcrText,
  beginOcrSelection,
  moveOcrSelection,
  endOcrSelection
} = useOcrCapture({ sourceText, onCopied: markCopied });

const activeSegmentId = computed(() => lockedSegmentId.value ?? hoveredSegmentId.value);
const hasStructuredResult = computed(() => Boolean(result.value?.segments.length) && (status.value === "success" || status.value === "streaming"));
const dictionaryContext = computed(() => displaySegments.value.find((segment) => segment.id === dictionarySegmentId.value));
const glossaryValidation = computed(() => result.value?.glossaryValidation ?? []);
const dictionaryEligible = computed(() => shouldLookupDictionary(sourceText.value));
const showDictionaryPane = computed(() => dictionaryEligible.value && dictionaryStatus.value === "found" && Boolean(autoDictionaryResult.value?.entry));
const showDictionaryTab = computed(() => dictionaryEligible.value);
const primaryActionLabel = computed(() => (showDictionaryPane.value && resultView.value === "dictionary" ? "AI 翻译" : "开始翻译"));
const showRevisionPopover = computed(() => Boolean(lockedSegment.value && hasStructuredResult.value));
const showMainDictionary = computed(() => showDictionaryPane.value && resultView.value === "dictionary");
const dictionarySuggestions = computed(() => autoDictionaryResult.value?.suggestions ?? []);

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

function undoCleanupAndRetranslate(): void {
  const original = result.value?.originalSourceText;
  if (!original) return;
  sourceText.value = original;
  cleanupDismissed.value = true;
  void translate();
}

async function translate(): Promise<void> {
  hoveredSegmentId.value = undefined;
  lockedSegmentId.value = undefined;
  clearRevisions();
  cleanupDismissed.value = false;
  showOriginalText.value = false;
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

async function addActiveSegmentToGlossary(): Promise<void> {
  const segment = lockedSegment.value;
  if (!segment) return;
  try {
    const now = Date.now();
    await translator.glossary.upsert({
      id: crypto.randomUUID(),
      sourceTerm: segment.source,
      targetTerm: segment.target,
      sourceLanguage: "auto",
      targetLanguage: result.value?.targetLanguage ?? targetLanguage.value,
      domain: "翻译结果",
      caseSensitive: false,
      matchMode: "phrase",
      enabled: true,
      createdAt: now,
      updatedAt: now
    });
    revisionError.value = "";
    revisionNotice.value = "已将当前句段加入本地术语表。";
  } catch (error) {
    revisionNotice.value = "";
    revisionError.value = error instanceof Error ? error.message : "加入术语表失败。";
  }
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

function closeOcr(): void {
  ocrResult.value = undefined;
  ocrSelection.value = undefined;
  ocrEditedText.value = "";
}

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
  markCopied();
}

async function copySource(): Promise<void> {
  if (!sourceText.value) return;
  await translator.clipboard.writeText(sourceText.value);
  markCopied();
}

async function copyBilingual(): Promise<void> {
  if (!sourceText.value || !displayResultText.value) return;
  await translator.clipboard.writeText(`原文：${sourceText.value}\n\n译文：${displayResultText.value}`);
  markCopied();
}

onMounted(async () => {
  void nextTick(resizeSourceTextarea);
  const settings = await translator.settings.get();
  maxInputLength.value = settings.translation.maxInputLength;
  targetLanguage.value = settings.translation.targetLanguage;
  providerLabel.value = settings.provider.type === "ollama" ? "本地模型" : "远程模型";
  profiles.value = await translator.profiles.list();
  const quickSession = await translator.translation.getSession();
  if (quickSession && !sourceText.value) {
    sourceText.value = quickSession.sourceText;
    profileId.value = quickSession.profileId;
    targetLanguage.value = quickSession.targetLanguage;
    resultText.value = quickSession.resultText;
    if (quickSession.resultText || quickSession.segments.length) {
      result.value = { requestId: quickSession.requestId ?? quickSession.id, sourceText: quickSession.sourceText, originalSourceText: quickSession.sourceText, targetText: quickSession.resultText, sourceLanguage: "", targetLanguage: quickSession.targetLanguage, segments: quickSession.segments, modelInfo: { provider: "ollama", model: "", durationMs: 0 }, createdAt: quickSession.createdAt };
    }
    status.value = quickSession.status;
    lastTranslatedSource.value = quickSession.sourceText;
  }

  const pending = sessionStorage.getItem("lexiflow:retranslate");
  if (!pending) return;
  sessionStorage.removeItem("lexiflow:retranslate");
  try {
    const history = JSON.parse(pending) as {
      id?: string;
      sourceText: string;
      originalSourceText?: string;
      resultText?: string;
      mode: TranslationMode;
      targetLanguage: TargetLanguage;
      profileId?: string;
      revisions?: SegmentRevision[];
      segments?: TranslationSegment[];
    };
    sourceText.value = history.sourceText;
    mode.value = history.mode === "naming" ? "normal" : history.mode;
    profileId.value = history.profileId ?? (history.mode === "technical" ? "technical" : "general");
    targetLanguage.value = history.targetLanguage;
    if (history.revisions?.length) revisions.value = history.revisions;
    if (history.id) historyId.value = history.id;
    if (history.segments?.length && history.resultText) {
      result.value = {
        requestId: history.id ?? "restored",
        sourceText: history.sourceText,
        originalSourceText: history.originalSourceText ?? history.sourceText,
        targetText: history.resultText,
        sourceLanguage: "",
        targetLanguage: history.targetLanguage,
        segments: history.segments,
        modelInfo: { provider: "ollama", model: "", durationMs: 0 },
        createdAt: Date.now()
      };
      resultText.value = history.resultText;
      status.value = "success";
      lastTranslatedSource.value = history.sourceText;
    }
    void nextTick(resizeSourceTextarea);
  } catch {
    // Ignore malformed session data; it should never block the translation page.
  }
});

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
          <button v-for="item in PROFILE_SHORTCUTS" :key="item.id" :class="{ active: profileId === item.id }" @click="selectProfileShortcut(item.id)">{{ item.label }}</button>
        </div>
      </template>
      <div class="control-inline">
        <label>目标语言<select v-model="targetLanguage"><option value="auto">自动识别</option><option value="zh-CN">中文</option><option value="en">英文</option></select></label>
        <label>Profile<select v-model="profileId" @change="onProfileChange"><option v-for="profile in profiles" :key="profile.id" :value="profile.id">{{ profile.name }}</option></select></label>
      </div>
      <span class="status-chip">{{ providerLabel }}</span>
    </PageHeader>
    <section v-if="ocrResult || ocrError" class="ocr-card surface">
      <div class="panel-toolbar">
        <span>OCR 结果</span>
        <div>
          <button v-if="ocrResult" class="text-button" :disabled="ocrLoading" @click="captureOcr">重新识别</button>
          <button v-if="ocrResult" class="text-button" @click="copyOcrText">复制原文</button>
          <button v-if="ocrResult" class="text-button" @click="closeOcr">关闭</button>
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
        <div class="panel-toolbar">
          <span>原文</span>
          <div class="control-inline">
            <button class="icon-button" :disabled="ocrLoading" title="截图识别" aria-label="截图识别" @click="captureOcr"><AppIcon name="search" :size="16" /></button>
            <button v-if="sourceText" class="text-button" @click="sourceText = ''">清空</button>
          </div>
        </div>
        <div v-if="cleanupNotice" class="cleanup-notice">
          <span>{{ cleanupNotice }}</span>
          <button class="text-button" @click="showOriginalText = !showOriginalText">{{ showOriginalText ? '查看整理后' : '查看原文' }}</button>
          <button class="text-button" @click="undoCleanupAndRetranslate">撤销整理</button>
          <button class="text-button" @click="cleanupDismissed = true">关闭</button>
        </div>
        <pre v-if="showOriginalText && result?.originalSourceText" class="cleanup-original">{{ result.originalSourceText }}</pre>
        <div class="source-body">
          <textarea ref="sourceTextarea" v-model="sourceText" autofocus rows="1" placeholder="输入或粘贴文本，Ctrl + Enter 执行" @input="resizeSourceTextarea" @keydown.ctrl.enter.prevent="translate" />
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
            <DictionaryCard v-if="autoDictionaryResult?.entry" :entry="autoDictionaryResult.entry" @ai-translate="triggerAiTranslate" />
          </template>
          <template v-else>
            <p v-if="dictionaryStatus === 'not-found' && dictionaryEligible" class="dictionary-hint muted">本地词典未收录，将使用模型翻译。<span v-if="dictionarySuggestions.length">建议：{{ dictionarySuggestions.join('、') }}</span></p>
            <p v-else-if="dictionaryStatus === 'unavailable'" class="dictionary-hint muted">{{ autoDictionaryResult?.unavailableReason || '本地词典资源不可用，仍可使用 AI 翻译。' }}</p>
            <ResultPanel :status="status" :text="displayResultText" :source-text="sourceText" :error="errorMessage" :warning="warningMessage" :segments="displaySegments" :active-segment-id="activeSegmentId" :copied="copied" @copy="copyResult" @copy-source="copySource" @copy-bilingual="copyBilingual" @stop="stop" @retry="retry" @hover="handleSegmentHover" @toggle="toggleSegment" @clear="clearSegmentLock" @navigate="navigateSegment" @select-term="lookupDictionary" />
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
                <div class="form-grid"><label>源词<input v-model="glossaryFromDictionary.sourceTerm" /></label><label>目标词<input v-model="glossaryFromDictionary.targetTerm" placeholder="固定译法" /></label></div>
                <button class="secondary-button" @click="addDictionaryTermToGlossary">加入术语表</button>
                <small v-if="glossaryFromDictionaryNotice" class="muted">{{ glossaryFromDictionaryNotice }}</small>
              </div>
            </div>
            <div v-else-if="dictionaryError" class="state-message error-message">{{ dictionaryError }}</div>
            <div v-else class="state-message muted">{{ segmentDictionary?.unavailableReason || '本地词典暂未收录该词或短语。' }}<p v-if="segmentDictionary?.suggestions?.length" class="dictionary-hint muted">建议：{{ segmentDictionary.suggestions.join('、') }}</p></div>
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
    <section v-if="glossaryValidation.length" class="glossary-validation-card surface"><div class="panel-toolbar"><span>术语校验</span><small>{{ glossaryValidation.filter((item) => item.applied).length }} / {{ glossaryValidation.length }} 已按术语表使用</small></div><ul><li v-for="item in glossaryValidation" :key="item.sourceTerm" :class="item.applied ? 'glossary-valid' : 'glossary-invalid'">{{ item.applied ? '✓' : '!' }} {{ item.sourceTerm }} → {{ item.targetTerm }}{{ item.applied ? '' : '（译文中未检测到）' }}</li></ul></section>
  </div>
</template>
