<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { useRoute } from "vue-router";
import type { NamingResult } from "../../electron/shared/types";
import DictionaryDrawer from "../features/translation/components/DictionaryDrawer.vue";
import SegmentActionPopover from "../features/translation/components/SegmentActionPopover.vue";
import OcrCaptureOverlay from "../features/ocr/OcrCaptureOverlay.vue";
import WorkbenchComposer from "../features/workbench/components/WorkbenchComposer.vue";
import WorkbenchResultHost from "../features/workbench/components/WorkbenchResultHost.vue";
import { useWorkbenchResultType } from "../features/workbench/useWorkbenchResultType";
import { useTranslationWorkspace } from "../features/translation/useTranslationWorkspace";

const workspace = useTranslationWorkspace();
const route = useRoute();
const pasteGuard = ref(false);
const {
  sourceText, mode, namingOptions, targetLanguage, maxInputLength,
  showOriginalText, cleanupNotice, cleanupDismissed, undoCleanupAndRetranslate, isRunning, triggerAiTranslate,
  showMainDictionary, autoDictionaryResult, dictionaryStatus, dictionaryEligible, dictionarySuggestions,
  status, displayResultText, result, errorMessage, warningMessage, displaySegments, activeSegmentId, copied,
  copyResult, copySource, copyBilingual, copyNamingCandidate, stop, retry, handleSegmentHover, toggleSegment, clearSegmentLock,
  navigateSegment, lookupDictionary, captureOcr, ocrResult, ocrError, ocrLoading, closeOcr, ocrSelectionStyle, selectingOcr,
  beginOcrSelection, moveOcrSelection, endOcrSelection, cancelOcrSelection, setOcrImage,
  dictionaryTerm, dictionaryLoading, dictionaryError, segmentDictionary, closeDictionary, dictionaryContext,
  dictionaryContextLoading, dictionaryContextText, dictionaryContextError, glossaryFromDictionary, glossaryFromDictionaryNotice,
  addDictionaryTermToGlossary, showRevisionPopover, alternativesLoading, requestAlternatives, addActiveSegmentToGlossary,
  revisions, lockedSegment, undoRevision, customRevisionInstruction, revisionStatus, reviseSegment, reviseWithCustomInstruction,
  alternatives, applyAlternative, revisionError, revisionNotice
} = workspace;

const namingResult = computed<NamingResult | null>(() => {
  if (mode.value !== "naming" || status.value !== "success") return null;
  try { return JSON.parse(displayResultText.value) as NamingResult; } catch { return null; }
});
const resultType = useWorkbenchResultType({
  mode, sourceText, status, displayResultText, displaySegments, showMainDictionary, namingResult
});
const composerCompact = computed(() => resultType.value !== "empty" && resultType.value !== "loading");
const emptyLabel = computed(() => (mode.value === "naming" ? "开始命名吧" : "开始翻译吧"));
const emptyHint = computed(() => (mode.value === "naming"
  ? "描述含义，生成贴合语义的名称"
  : "支持粘贴、<b>划词</b>、OCR 输入"));
const dictionaryNote = computed(() => {
  if (dictionaryStatus.value !== "not-found" || !dictionaryEligible.value) return "";
  const suggestions = dictionarySuggestions.value.length ? ` · 建议：${dictionarySuggestions.value.join("、")}` : "";
  return `本地词典未收录，已按翻译处理${suggestions}`;
});
const showOcrOverlay = computed(() => ocrLoading.value || Boolean(ocrResult.value) || Boolean(ocrError.value));

async function handlePaste(): Promise<void> {
  if (mode.value === "naming" || pasteGuard.value) return;
  pasteGuard.value = true;
  try {
    await nextTick();
    if (sourceText.value.trim()) await triggerAiTranslate();
  } finally {
    window.setTimeout(() => { pasteGuard.value = false; }, 300);
  }
}

function setMode(value: "normal" | "naming"): void {
  mode.value = value;
  if (value === "naming") workspace.profileId.value = "general";
}

function onOcrRequest(): void { void captureOcr(); }

onMounted(() => {
  if (route.query.mode === "naming") setMode("naming");
  window.addEventListener("lexiflow:ocr", onOcrRequest);
});
onUnmounted(() => window.removeEventListener("lexiflow:ocr", onOcrRequest));
</script>

<template>
  <div class="workbench-page">
    <OcrCaptureOverlay
      v-if="showOcrOverlay"
      :result="ocrResult"
      :error="ocrError"
      :loading="ocrLoading"
      :selection-style="ocrSelectionStyle"
      :selecting="selectingOcr"
      @retry="captureOcr"
      @close="closeOcr"
      @begin-selection="beginOcrSelection"
      @move-selection="moveOcrSelection"
      @end-selection="endOcrSelection"
      @cancel-selection="cancelOcrSelection"
      @image-ref="setOcrImage"
    />

    <h1 class="visually-hidden">翻译</h1>

    <WorkbenchComposer
      :source-text="sourceText"
      :mode="mode"
      :naming-options="namingOptions"
      :target-language="targetLanguage"
      :max-input-length="maxInputLength"
      :is-running="isRunning"
      :compact="composerCompact"
      @update:source-text="sourceText = $event"
      @update:naming-options="namingOptions = $event"
      @update:target-language="targetLanguage = $event"
      @submit="triggerAiTranslate"
      @paste="handlePaste"
      @clear="sourceText = ''"
    />

    <div v-if="cleanupNotice" class="cleanup-notice">
      <span>{{ cleanupNotice }}</span>
      <button type="button" @click="showOriginalText = !showOriginalText">{{ showOriginalText ? "查看整理后" : "查看原文" }}</button>
      <button type="button" @click="undoCleanupAndRetranslate">撤销</button>
      <button type="button" @click="cleanupDismissed = true">关闭</button>
    </div>
    <pre v-if="showOriginalText && result?.originalSourceText" class="original-text">{{ result.originalSourceText }}</pre>

    <WorkbenchResultHost
      :result-type="resultType"
      :empty-label="emptyLabel"
      :empty-hint="emptyHint"
      :dictionary-entry="autoDictionaryResult?.entry"
      :naming-result="namingResult"
      :display-result-text="displayResultText"
      :source-text="sourceText"
      :status="status"
      :error-message="errorMessage"
      :warning-message="warningMessage"
      :segments="displaySegments"
      :active-segment-id="activeSegmentId"
      :copied="copied"
      :dictionary-note="dictionaryNote"
      @copy="copyResult"
      @copy-source="copySource"
      @copy-bilingual="copyBilingual"
      @copy-naming="copyNamingCandidate"
      @stop="stop"
      @retry="retry"
      @regenerate="triggerAiTranslate"
      @hover="handleSegmentHover"
      @toggle="toggleSegment"
      @clear="clearSegmentLock"
      @navigate="navigateSegment"
      @select-term="lookupDictionary"
    />

    <DictionaryDrawer
      :term="dictionaryTerm"
      :loading="dictionaryLoading"
      :error="dictionaryError"
      :lookup="segmentDictionary"
      :context="dictionaryContext"
      :context-loading="dictionaryContextLoading"
      :context-text="dictionaryContextText"
      :context-error="dictionaryContextError"
      :source-term="glossaryFromDictionary.sourceTerm"
      :target-term="glossaryFromDictionary.targetTerm"
      :notice="glossaryFromDictionaryNotice"
      @close="closeDictionary"
      @ai-translate="triggerAiTranslate"
      @update:source-term="glossaryFromDictionary.sourceTerm = $event"
      @update:target-term="glossaryFromDictionary.targetTerm = $event"
      @add-term="addDictionaryTermToGlossary"
    />
    <SegmentActionPopover
      v-if="showRevisionPopover"
      :locked-segment="lockedSegment"
      :revisions="revisions"
      :alternatives-loading="alternativesLoading"
      :revision-status="revisionStatus"
      :revision-error="revisionError"
      :revision-notice="revisionNotice"
      :custom-instruction="customRevisionInstruction"
      :alternatives="alternatives"
      @request-alternatives="requestAlternatives"
      @add-to-glossary="addActiveSegmentToGlossary"
      @undo="undoRevision"
      @close="clearSegmentLock"
      @revise="reviseSegment"
      @update:custom-instruction="customRevisionInstruction = $event"
      @revise-custom="reviseWithCustomInstruction"
      @apply-alternative="applyAlternative"
    />
  </div>
</template>

<style scoped>
.workbench-page {
  position: relative; width: 100%; height: 100%; min-height: 0; margin: 0 auto;
  padding: 12px 16px 18px; display: flex; flex-direction: column; gap: 10px; overflow: auto;
  scrollbar-width: none;
}
.workbench-page::-webkit-scrollbar { width: 0; height: 0; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.cleanup-notice, .original-text { margin: 0 4px; color: var(--muted); font-size: 12px; }
.cleanup-notice { display: flex; gap: 8px; flex-wrap: wrap; }
.cleanup-notice button { border: 0; color: var(--accent-strong); background: none; cursor: pointer; }
.original-text { max-height: 100px; overflow: auto; padding: 9px; border-radius: 8px; background: var(--surface-soft); }
</style>
