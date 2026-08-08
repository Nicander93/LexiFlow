<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted } from "vue";
import { useRoute } from "vue-router";
import type { NamingResult } from "../../electron/shared/types";
import AppIcon from "../components/AppIcon.vue";
import DictionaryCard from "../features/dictionary/components/DictionaryCard.vue";
import ResultPanel from "../features/translation/components/ResultPanel.vue";
import SegmentedText from "../features/translation/components/SegmentedText.vue";
import SegmentActionPopover from "../features/translation/components/SegmentActionPopover.vue";
import DictionaryDrawer from "../features/translation/components/DictionaryDrawer.vue";
import OcrWorkspace from "../features/ocr/components/OcrWorkspace.vue";
import { useTranslationWorkspace } from "../features/translation/useTranslationWorkspace";

const workspace = useTranslationWorkspace();
const route = useRoute();
const {
  sourceText, mode, namingOptions, targetLanguage, profiles, profileId, onProfileChange, maxInputLength,
  showOriginalText, cleanupNotice, cleanupDismissed, undoCleanupAndRetranslate, isRunning, triggerAiTranslate,
  showMainDictionary, autoDictionaryResult, dictionaryStatus, dictionaryEligible, dictionarySuggestions,
  status, displayResultText, result, errorMessage, warningMessage, displaySegments, activeSegmentId, copied,
  copyResult, copySource, copyBilingual, stop, retry, handleSegmentHover, toggleSegment, clearSegmentLock,
  navigateSegment, lookupDictionary, captureOcr, ocrResult, ocrError, ocrLoading, copyOcrText, closeOcr, ocrSelectionStyle, selectingOcr, beginOcrSelection, moveOcrSelection, endOcrSelection, cancelOcrSelection, setOcrImage, useOcrBlock, ocrEditedText, applyOcrEditedText, dictionaryTerm, dictionaryLoading, dictionaryError,
  segmentDictionary, closeDictionary, dictionaryContext, dictionaryContextLoading, dictionaryContextText,
  dictionaryContextError, glossaryFromDictionary, glossaryFromDictionaryNotice, addDictionaryTermToGlossary,
  showRevisionPopover, alternativesLoading, requestAlternatives, addActiveSegmentToGlossary, revisions,
  lockedSegment, undoRevision, customRevisionInstruction, revisionStatus, reviseSegment, reviseWithCustomInstruction,
  alternatives, applyAlternative, revisionError, revisionNotice, sourceTextarea
} = workspace;

const isLongReading = computed(() => mode.value !== "naming" && !showMainDictionary.value && displaySegments.value.length > 1 && sourceText.value.length > 240);
const hasResolvedContent = computed(() => showMainDictionary.value || (status.value === "success" && Boolean(displayResultText.value)));
const namingResult = computed<NamingResult | null>(() => {
  if (mode.value !== "naming" || status.value !== "success") return null;
  try { return JSON.parse(displayResultText.value) as NamingResult; } catch { return null; }
});
async function handlePaste(): Promise<void> { await nextTick(); if (sourceText.value.trim()) await triggerAiTranslate(); }
function setMode(value: "normal" | "naming"): void { mode.value = value; if (value === "naming") profileId.value = "general"; }
function onOcrRequest(): void { void captureOcr(); }
onMounted(() => { if (route.query.mode === "naming") setMode("naming"); window.addEventListener("lexiflow:ocr", onOcrRequest); });
onUnmounted(() => window.removeEventListener("lexiflow:ocr", onOcrRequest));
</script>

<template>
  <div class="workbench-page">
    <div v-if="ocrLoading || ocrResult || ocrError" class="ocr-overlay" @click.self="closeOcr"><OcrWorkspace :result="ocrResult" :error="ocrError" :loading="ocrLoading" :selection-style="ocrSelectionStyle" :selecting="selectingOcr" :edited-text="ocrEditedText" @retry="captureOcr" @copy="copyOcrText" @close="closeOcr" @begin-selection="beginOcrSelection" @move-selection="moveOcrSelection" @end-selection="endOcrSelection" @cancel-selection="cancelOcrSelection" @use-block="useOcrBlock" @update:edited-text="ocrEditedText = $event" @apply="applyOcrEditedText" @image-ref="setOcrImage" /></div>
    <h1 class="visually-hidden">翻译</h1>
    <div v-if="mode === 'naming'" class="naming-toolbar">
      <a href="#/" aria-label="退出命名模式">←</a>
      <span>模式</span><strong>命名</strong>
      <label>类型<select v-model="namingOptions.type"><option value="variable">变量</option><option value="boolean">布尔变量</option><option value="method">方法</option><option value="class">类</option><option value="interface">接口</option><option value="constant">常量</option></select></label>
      <label>风格<select v-model="namingOptions.style"><option>camelCase</option><option>PascalCase</option><option>snake_case</option><option>kebab-case</option></select></label>
    </div>
    <section v-if="!hasResolvedContent" class="workbench-input" :class="{ compact: Boolean(displayResultText) }">
      <textarea ref="sourceTextarea" v-model="sourceText" autofocus :maxlength="maxInputLength" :placeholder="mode === 'naming' ? '描述你想命名的内容，Enter 生成' : '粘贴文本 / 输入内容，Enter 翻译'" @paste="handlePaste" @keydown.enter.exact.prevent="triggerAiTranslate" />
      <div class="input-meta">
        <span v-if="sourceText" class="input-count">{{ sourceText.length.toLocaleString() }} / {{ maxInputLength.toLocaleString() }}</span>
        <button v-if="sourceText" class="clear-input" aria-label="清空输入" @click="sourceText = ''">×</button>
        <button class="send-button" :disabled="isRunning" :aria-label="mode === 'naming' ? '生成名称' : '开始翻译'" @click="triggerAiTranslate">↗</button>
      </div>
    </section>
    <div v-if="cleanupNotice" class="cleanup-notice"><span>{{ cleanupNotice }}</span><button @click="showOriginalText = !showOriginalText">{{ showOriginalText ? '查看整理后' : '查看原文' }}</button><button @click="undoCleanupAndRetranslate">撤销</button><button @click="cleanupDismissed = true">关闭</button></div>
    <pre v-if="showOriginalText && result?.originalSourceText" class="original-text">{{ result.originalSourceText }}</pre>

    <section v-if="!sourceText && status === 'idle'" class="workbench-empty">
      <div class="empty-illustration" aria-hidden="true"><div class="plant"><i /><i /><b /></div><span>{{ mode === 'naming' ? '开始命名吧' : '开始翻译吧' }}</span><em>↝</em></div>
      <span v-if="mode === 'naming'">描述含义，生成贴合语义的名称</span>
      <span v-else>支持粘贴、<b>划词</b>、OCR 输入</span>
    </section>
    <section v-else-if="showMainDictionary && autoDictionaryResult?.entry" class="workbench-result dictionary-result"><DictionaryCard :entry="autoDictionaryResult.entry" @ai-translate="triggerAiTranslate" /></section>
    <section v-else-if="mode === 'naming' && namingResult" class="naming-results">
      <button v-for="candidate in namingResult.candidates" :key="candidate.name" @click="workspace.copyResult"><code>{{ candidate.name }}</code><span>{{ candidate.meaning }}</span><AppIcon name="copy" :size="14" /></button>
    </section>
    <section v-else-if="isLongReading" class="bilingual-reading">
      <div><header>原文 <button @click="copySource"><AppIcon name="copy" :size="14" /></button></header><SegmentedText side="source" :segments="displaySegments" :active-id="activeSegmentId" @hover="handleSegmentHover" @toggle="toggleSegment" @clear="clearSegmentLock" @navigate="navigateSegment" /></div>
      <div><header>译文 <button @click="copyResult"><AppIcon name="copy" :size="14" /></button></header><SegmentedText side="target" :segments="displaySegments" :active-id="activeSegmentId" @hover="handleSegmentHover" @toggle="toggleSegment" @clear="clearSegmentLock" @navigate="navigateSegment" @select-term="lookupDictionary" /></div>
      <footer><button class="active">双语对照</button><button>仅译文</button></footer>
    </section>
    <section v-else-if="status === 'success' && displayResultText" class="simple-translation">
      <header class="source-result-row"><h2>{{ sourceText }}</h2><div><button title="收藏">☆</button><button title="更多操作">•••</button></div></header>
      <div class="translation-meta"><span>{{ result?.sourceLanguage || '自动识别' }} → {{ result?.targetLanguage === 'en' ? '英文' : '中文（简体）' }}</span><div><button title="复制原文" @click="copySource"><AppIcon name="copy" :size="14" /></button><button title="复制译文" @click="copyResult"><AppIcon name="copy" :size="14" /></button><button title="更多操作">•••</button></div></div>
      <div class="simple-target"><SegmentedText v-if="displaySegments.length" side="target" :segments="displaySegments" :active-id="activeSegmentId" @hover="handleSegmentHover" @toggle="toggleSegment" @clear="clearSegmentLock" @navigate="navigateSegment" @select-term="lookupDictionary" /><p v-else>{{ displayResultText }}</p></div>
      <details class="ai-explanation"><summary>AI 解释（可选）</summary><p>当前译文优先保持原意、语气与结构清晰。</p></details>
    </section>
    <ResultPanel v-else class="workbench-result" :status="status" :text="displayResultText" :source-text="sourceText" :error="errorMessage" :warning="warningMessage" :segments="displaySegments" :active-segment-id="activeSegmentId" :copied="copied" @copy="copyResult" @copy-source="copySource" @copy-bilingual="copyBilingual" @stop="stop" @retry="retry" @hover="handleSegmentHover" @toggle="toggleSegment" @clear="clearSegmentLock" @navigate="navigateSegment" @select-term="lookupDictionary" />
    <p v-if="dictionaryStatus === 'not-found' && dictionaryEligible" class="dictionary-note">本地词典未收录，已按翻译处理<span v-if="dictionarySuggestions.length"> · 建议：{{ dictionarySuggestions.join('、') }}</span></p>

    <DictionaryDrawer :term="dictionaryTerm" :loading="dictionaryLoading" :error="dictionaryError" :lookup="segmentDictionary" :context="dictionaryContext" :context-loading="dictionaryContextLoading" :context-text="dictionaryContextText" :context-error="dictionaryContextError" :source-term="glossaryFromDictionary.sourceTerm" :target-term="glossaryFromDictionary.targetTerm" :notice="glossaryFromDictionaryNotice" @close="closeDictionary" @ai-translate="triggerAiTranslate" @update:source-term="glossaryFromDictionary.sourceTerm = $event" @update:target-term="glossaryFromDictionary.targetTerm = $event" @add-term="addDictionaryTermToGlossary" />
    <SegmentActionPopover v-if="showRevisionPopover" :locked-segment="lockedSegment" :revisions="revisions" :alternatives-loading="alternativesLoading" :revision-status="revisionStatus" :revision-error="revisionError" :revision-notice="revisionNotice" :custom-instruction="customRevisionInstruction" :alternatives="alternatives" @request-alternatives="requestAlternatives" @add-to-glossary="addActiveSegmentToGlossary" @undo="undoRevision" @close="clearSegmentLock" @revise="reviseSegment" @update:custom-instruction="customRevisionInstruction = $event" @revise-custom="reviseWithCustomInstruction" @apply-alternative="applyAlternative" />
  </div>
</template>

<style scoped>
.workbench-page { position: relative; width: 100%; height: 100%; min-height: 0; margin: 0 auto; padding: 12px 14px 18px; display: flex; flex-direction: column; overflow: auto; scrollbar-width: none; }
.workbench-page::-webkit-scrollbar { width: 0; height: 0; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.ocr-overlay { position: fixed; inset: 74px 0 0; z-index: 25; display: grid; place-items: center; padding: 18px; background: rgba(45,51,43,.22); backdrop-filter: blur(2px); }.ocr-overlay :deep(.ocr-card) { width: min(760px, 100%); max-height: calc(100dvh - 110px); overflow: auto; margin: 0; background: var(--surface); box-shadow: var(--shadow-float); }
.naming-toolbar { min-height: 38px; display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding: 5px 8px; border: 1px solid var(--border); border-radius: 7px; color: var(--muted); background: var(--surface); font-size: 10px; }.naming-toolbar > a { width: 25px; height: 25px; display: grid; place-items: center; border-radius: 4px; color: var(--ink-soft); text-decoration: none; }.naming-toolbar > a:hover { background: var(--surface-soft); }.naming-toolbar strong { color: var(--ink); font-size: 11px; }.naming-toolbar label { display: flex; align-items: center; gap: 4px; margin-left: auto; }.naming-toolbar label + label { margin-left: 0; }.naming-toolbar select { width: auto; min-height: 26px; padding: 2px 24px 2px 7px; border-radius: 5px; font-size: 10px; }
.workbench-input { min-height: 104px; display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); transition: min-height .2s ease, border-color .18s ease; }.workbench-input:focus-within { border-color: rgba(87,148,93,.48); }.workbench-input.compact { min-height: 92px; }
.workbench-input textarea { flex: 1; min-height: 66px; max-height: 28vh; padding: 12px 14px 4px; resize: none; border: 0; box-shadow: none; background: transparent; font-size: 13px; line-height: 1.55; }.workbench-input textarea:hover, .workbench-input textarea:focus { border: 0; box-shadow: none; background: transparent; }
.input-meta { min-height: 35px; display: flex; align-items: center; justify-content: flex-end; gap: 7px; padding: 4px 7px 6px 14px; color: var(--muted); font-size: 9px; }.input-count { font-variant-numeric: tabular-nums; }
.clear-input, .send-button { width: 28px; height: 28px; display: grid; place-items: center; border: 0; border-radius: 6px; }.clear-input { color: var(--muted); background: transparent; font-size: 16px; }.clear-input:hover { color: var(--ink); background: var(--surface-soft); }.send-button { color: white; background: var(--accent); font-size: 16px; transition: transform .18s ease, background .18s ease; }.send-button:hover { background: var(--accent-strong); transform: translateY(-1px); }.send-button:active { transform: scale(.96); }
.workbench-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 230px; padding-bottom: 38px; color: var(--muted); }.workbench-empty > span { margin-top: 7px; font-size: 10px; }.workbench-empty > span b { color: var(--accent-strong); font-weight: 500; }
.empty-illustration { position: relative; width: 176px; height: 70px; }.empty-illustration > span { position: absolute; left: 72px; top: 12px; padding: 8px 11px; border: 1px solid var(--border-strong); border-radius: 48% 48% 48% 12px; color: var(--ink-soft); background: var(--surface); font-size: 11px; font-weight: 600; transform: rotate(-2deg); }.empty-illustration > em { position: absolute; left: 136px; top: 43px; color: var(--ink-soft); font-size: 17px; font-style: normal; transform: rotate(26deg); }
.plant { position: absolute; left: 27px; bottom: 0; width: 52px; height: 58px; }.plant b { position: absolute; left: 15px; bottom: 0; width: 27px; height: 22px; border: 1.4px solid var(--ink-soft); border-radius: 2px 2px 7px 7px; background: #e8dfc5; transform: rotate(-1deg); }.plant i { position: absolute; left: 27px; bottom: 20px; width: 16px; height: 27px; border: solid var(--accent-strong); border-width: 0 0 1.7px 1.7px; border-radius: 80% 10%; transform: rotate(-30deg); }.plant i:nth-child(2) { left: 22px; bottom: 25px; transform: scaleX(-1) rotate(-42deg); }
.workbench-result { flex: 1; min-height: 230px; margin-top: 12px; border: 0; border-radius: 0; box-shadow: none; background: transparent; }.dictionary-result :deep(.dictionary-card-panel) { margin: 0; padding: 2px 0 16px; border: 0; background: transparent; }.dictionary-result :deep(.dictionary-labels), .dictionary-result :deep(.dictionary-forms), .dictionary-result :deep(.dictionary-fold) { display: none; }.dictionary-result :deep(.dictionary-senses li:first-child) { margin-top: 2px; padding: 6px 8px; border-radius: 5px; background: var(--accent-soft); }.dictionary-result :deep(.dictionary-card-actions) { justify-content: flex-start; border-top: 1px solid var(--border); padding-top: 8px; }
.bilingual-reading { flex: 1; min-height: 300px; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: minmax(0,1fr) 34px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--surface); }.bilingual-reading > div { min-width: 0; overflow: auto; }.bilingual-reading > div + div { border-left: 1px solid var(--border); background: var(--accent-faint); }.bilingual-reading header { height: 34px; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; border-bottom: 1px solid var(--border); color: var(--muted); font-size: 9px; }.bilingual-reading header button { border: 0; color: var(--muted); background: none; }.bilingual-reading footer { grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; border-top: 1px solid var(--border); }.bilingual-reading footer button { min-width: 68px; height: 26px; border: 1px solid var(--border); color: var(--muted); background: var(--surface); font-size: 9px; }.bilingual-reading footer button:first-child { border-radius: 13px 0 0 13px; }.bilingual-reading footer button:last-child { margin-left: -1px; border-radius: 0 13px 13px 0; }.bilingual-reading footer button.active { color: var(--ink-soft); background: var(--accent-soft); }
.simple-translation { flex: 1; min-height: 0; padding: 5px 1px 18px; }.source-result-row, .translation-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.source-result-row { min-height: 42px; }.source-result-row h2 { margin: 0; font-size: 15px; line-height: 1.45; font-weight: 580; }.source-result-row div, .translation-meta div { display: flex; gap: 3px; }.source-result-row button, .translation-meta button { width: 27px; height: 27px; display: grid; place-items: center; border: 0; border-radius: 5px; color: var(--ink-soft); background: transparent; }.source-result-row button:hover, .translation-meta button:hover { background: var(--surface-soft); }.translation-meta { min-height: 34px; border-bottom: 1px solid var(--border); color: var(--muted); font-size: 9px; }.simple-target { min-height: 96px; padding: 13px 0 18px; border-bottom: 1px solid var(--border); }.simple-target :deep(.segment-text) { padding: 0; font-size: 15px; font-weight: 620; line-height: 1.7; }.simple-target p { margin: 0; font-size: 15px; line-height: 1.7; font-weight: 620; }.ai-explanation { margin-top: 10px; padding: 10px 12px; border-radius: 6px; color: var(--ink-soft); background: var(--surface-soft); font-size: 9px; }.ai-explanation summary { cursor: pointer; font-weight: 600; }.ai-explanation p { margin: 8px 0 0; color: var(--muted); line-height: 1.6; }
.naming-results { display: grid; gap: 1px; margin-top: 12px; border: 1px solid var(--border); border-radius: 9px; overflow: hidden; }.naming-results button { display: grid; grid-template-columns: minmax(160px,.8fr) 1fr auto; align-items: center; gap: 12px; border: 0; padding: 12px 14px; text-align: left; color: var(--ink); background: var(--surface); }.naming-results button + button { border-top: 1px solid var(--border); }.naming-results button:hover { background: var(--accent-soft); }.naming-results span { color: var(--muted); font-size: 11px; }
.cleanup-notice, .original-text, .dictionary-note { margin: 8px 4px 0; color: var(--muted); font-size: 10px; }.cleanup-notice { display: flex; gap: 8px; }.cleanup-notice button { border: 0; color: var(--accent-strong); background: none; }.original-text { max-height: 100px; overflow: auto; padding: 9px; border-radius: 6px; background: var(--surface-soft); }
@media (max-width: 720px) { .workbench-page { padding-inline: 12px; }.bilingual-reading { grid-template-columns: 1fr; grid-template-rows: auto auto 34px; }.bilingual-reading > div + div { border-left: 0; border-top: 1px solid var(--border); }.bilingual-reading footer { grid-column: 1; } }
</style>
