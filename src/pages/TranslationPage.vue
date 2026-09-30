<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import type { DictionaryEntry, NamingResult } from "../../electron/shared/types";
import DictionaryDrawer from "../features/translation/components/DictionaryDrawer.vue";
import SegmentActionPopover from "../features/translation/components/SegmentActionPopover.vue";
import OcrCaptureOverlay from "../features/ocr/OcrCaptureOverlay.vue";
import WorkbenchComposer from "../features/workbench/components/WorkbenchComposer.vue";
import WorkbenchResultHost from "../features/workbench/components/WorkbenchResultHost.vue";
import { useWorkbenchResultType } from "../features/workbench/useWorkbenchResultType";
import { useTranslationWorkspace } from "../features/translation/useTranslationWorkspace";
import { useVocabularyBook } from "../features/vocabulary/useVocabularyBook";
import TextSelectionActions from "../features/translation/components/TextSelectionActions.vue";
import SelectionTranslationPanel from "../features/translation/components/SelectionTranslationPanel.vue";
import { useSelectionTranslation } from "../features/translation/useSelectionTranslation";

const workspace = useTranslationWorkspace();
const selectionRoot = ref<HTMLElement>();
const selectionTranslation = useSelectionTranslation(workspace.profileId);
const { sourceText: selectedSource, state: selectionState, targetLanguage: selectionTarget, copied: selectionCopied } = selectionTranslation;
const route = useRoute();
const readingLayout = ref<"auto" | "translation" | "bilingual">("auto");
const vocabulary = useVocabularyBook(false);
const {
  sourceText, mode, namingOptions, targetLanguage, maxInputLength,
  showOriginalText, cleanupNotice, cleanupDismissed, undoCleanupAndRetranslate, isRunning, triggerAiTranslate,
  showMainDictionary, autoDictionaryResult, dictionaryStatus, dictionaryEligible, dictionarySuggestions,
  status, displayResultText, result, errorMessage, warningMessage, displaySegments, activeSegmentId, copied,
  copyResult, copySource, copyBilingual, copyNamingCandidate, stop, retry, handleSegmentHover, toggleSegment, clearSegmentLock,
  navigateSegment, lookupDictionary, captureOcr, ocrResult, ocrError, ocrLoading, closeOcr, ocrSelectionStyle, selectingOcr,
  beginOcrSelection, moveOcrSelection, endOcrSelection, cancelOcrSelection, setOcrImage,
  dictionaryTerm, dictionaryLoading, dictionaryError, segmentDictionary, closeDictionary, dictionaryContext,
  dictionaryContextLoading, dictionaryContextText, dictionaryContextError, requestDictionaryContext, glossaryFromDictionary, glossaryFromDictionaryNotice,
  addDictionaryTermToGlossary, showRevisionPopover, alternativesLoading, requestAlternatives,
  revisions, lockedSegment, undoRevision, customRevisionInstruction, revisionStatus, reviseSegment, reviseWithCustomInstruction,
  alternatives, applyAlternative, revisionError, revisionNotice,
  pendingRevision, applyRevision, discardSuggestion, lastInstruction, persistRevisions, sourceDirty, translationDirty, clearInput, copyDictionaryTerm
} = workspace;

const namingResult = computed<NamingResult | null>(() => {
  if (mode.value !== "naming" || status.value !== "success") return null;
  try { return JSON.parse(displayResultText.value) as NamingResult; } catch { return null; }
});
const resultType = useWorkbenchResultType({
  mode, sourceText, status, displayResultText, displaySegments, showMainDictionary, namingResult, readingLayout
});
const composerCompact = computed(() => resultType.value !== "empty" && resultType.value !== "loading");
const emptyLabel = computed(() => (mode.value === "naming" ? "开始命名吧" : "开始翻译吧"));
const emptyHint = computed(() => (mode.value === "naming"
  ? "描述含义，生成贴合语义的名称"
  : "支持粘贴、<b>划词</b>、OCR 输入"));
const dictionaryNote = computed(() => {
  if (dictionaryTerm.value) return "";
  if (dictionaryStatus.value !== "not-found" || !dictionaryEligible.value) return "";
  const suggestions = dictionarySuggestions.value.length ? ` · 建议：${dictionarySuggestions.value.join("、")}` : "";
  return `本地词典未收录，已按翻译处理${suggestions}`;
});
const showOcrOverlay = computed(() => ocrLoading.value || Boolean(ocrResult.value) || Boolean(ocrError.value));
watch(sourceText, selectionTranslation.close);
watch(() => result.value?.requestId, selectionTranslation.close);

function translateSelection(text: string): void {
  closeDictionary();
  clearSegmentLock();
  void selectionTranslation.start(text);
}
function lookupSelection(text: string, segmentId?: string): void {
  selectionTranslation.close();
  void lookupDictionary(text, segmentId);
}

function setMode(value: "normal" | "naming"): void {
  mode.value = value;
  if (value === "naming") workspace.profileId.value = "general";
}

function onOcrRequest(): void { void captureOcr(); }

function handlePageKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  if (selectedSource.value) selectionTranslation.close();
  else if (dictionaryTerm.value) closeDictionary();
  else if (lockedSegment.value) clearSegmentLock();
}

async function saveWord(entry: DictionaryEntry): Promise<void> {
  const context = lockedSegment.value?.source ?? (sourceText.value.length <= 500 ? sourceText.value : undefined);
  await vocabulary.saveDictionaryEntry(entry, context);
}

onMounted(() => {
  if (route.query.mode === "naming") setMode("naming");
  window.addEventListener("lexiflow:ocr", onOcrRequest);
  window.addEventListener("keydown", handlePageKeydown);
});
onUnmounted(() => {
  window.removeEventListener("lexiflow:ocr", onOcrRequest);
  window.removeEventListener("keydown", handlePageKeydown);
});
</script>

<template>
  <div ref="selectionRoot" class="workbench-page">
    <TextSelectionActions :root="selectionRoot" :max-length="maxInputLength" @translate="translateSelection" @dictionary="lookupSelection" />
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
      @clear="clearInput"
    />

    <div v-if="cleanupNotice" class="cleanup-notice">
      <span>{{ cleanupNotice }}</span>
      <button type="button" @click="showOriginalText = !showOriginalText">{{ showOriginalText ? "查看整理后" : "查看原文" }}</button>
      <button type="button" @click="undoCleanupAndRetranslate">撤销</button>
      <button type="button" @click="cleanupDismissed = true">关闭</button>
    </div>
    <pre v-if="showOriginalText && result?.originalSourceText" class="original-text">{{ result.originalSourceText }}</pre>
    <p v-if="vocabulary.notice.value" class="vocabulary-notice" role="status">{{ vocabulary.notice.value }} <a href="#/vocabulary">打开单词本</a></p>
    <p v-if="vocabulary.error.value" class="error-text" role="alert">{{ vocabulary.error.value }}</p>

    <div v-if="translationDirty && displayResultText" class="draft-notice" role="status">
      <span>{{ sourceDirty ? '原文已修改，译文待更新' : '目标语言已修改，译文待更新' }}。以下保留上次译文。</span>
      <button class="text-button" type="button" @click="triggerAiTranslate">更新翻译</button>
    </div>
    <div v-if="mode !== 'naming' && status === 'success' && displaySegments.length && !showMainDictionary" class="reading-layout" role="group" aria-label="阅读布局">
      <button type="button" :aria-pressed="resultType === 'translation'" @click="readingLayout = 'translation'">仅译文</button>
      <button type="button" :aria-pressed="resultType === 'bilingual'" @click="readingLayout = 'bilingual'">双语对照</button>
    </div>

    <WorkbenchResultHost
      :result-type="resultType"
      :empty-label="emptyLabel"
      :empty-hint="emptyHint"
      :dictionary-entry="autoDictionaryResult?.entry"
      :naming-result="namingResult"
      :display-result-text="displayResultText"
      :source-text="result?.sourceText ?? sourceText"
      :status="status"
      :error-message="errorMessage"
      :warning-message="warningMessage"
      :segments="displaySegments"
      :active-segment-id="activeSegmentId"
      :copied="copied"
      :adjustable="!translationDirty && status === 'success'"
      :dictionary-note="dictionaryNote"
      :source-language="result?.sourceLanguage"
      :target-language="result?.targetLanguage ?? (targetLanguage === 'auto' ? undefined : targetLanguage)"
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
      @save-word="saveWord"
    />

    <SelectionTranslationPanel
      v-if="selectedSource"
      :source-text="selectedSource" :state="selectionState" :target-language="selectionTarget" :copied="selectionCopied"
      @close="selectionTranslation.close" @cancel="selectionTranslation.cancel"
      @retry="selectionTranslation.start(selectedSource)" @copy="selectionTranslation.copy"
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
      @copy-term="copyDictionaryTerm"
      @translate-term="translateSelection"
      @lookup-term="(term) => lookupDictionary(term, dictionaryContext?.id)"
      @request-context="requestDictionaryContext"
      @update:source-term="glossaryFromDictionary.sourceTerm = $event"
      @update:target-term="glossaryFromDictionary.targetTerm = $event"
      @add-term="addDictionaryTermToGlossary"
      @save-word="saveWord"
    />
    <SegmentActionPopover
      v-if="showRevisionPopover"
      :key="lockedSegment?.id"
      :locked-segment="lockedSegment"
      :revisions="revisions"
      :alternatives-loading="alternativesLoading"
      :revision-status="revisionStatus"
      :revision-error="revisionError"
      :revision-notice="revisionNotice"
      :custom-instruction="customRevisionInstruction"
      :alternatives="alternatives"
      :pending-revision="pendingRevision"
      :last-instruction="lastInstruction"
      @request-alternatives="requestAlternatives"
      @undo="undoRevision"
      @close="clearSegmentLock"
      @revise="reviseSegment"
      @update:custom-instruction="customRevisionInstruction = $event"
      @revise-custom="reviseWithCustomInstruction"
      @apply-alternative="applyAlternative"
      @apply-revision="applyRevision"
      @discard-suggestion="discardSuggestion"
      @save-history="persistRevisions"
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
.vocabulary-notice { margin: 0 4px; color: var(--accent-strong); font-size: 12px; }
.vocabulary-notice a { color: inherit; font-weight: 600; }
.draft-notice { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 8px 12px; border-radius: 8px; background: var(--accent-faint); color: var(--ink-soft); font-size: 12px; }
.reading-layout { display: flex; justify-content: flex-end; gap: 4px; }
.reading-layout button { border: 0; border-radius: 6px; padding: 5px 10px; background: transparent; color: var(--ink-soft); cursor: pointer; font-size: 12px; }
.reading-layout button[aria-pressed="true"] { color: var(--accent-strong); background: var(--accent-soft); }
</style>
