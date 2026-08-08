<script setup lang="ts">
import PageHeader from "../components/PageHeader.vue";
import ResultPanel from "../features/translation/components/ResultPanel.vue";
import AppIcon from "../components/AppIcon.vue";
import DictionaryCard from "../features/dictionary/components/DictionaryCard.vue";
import OcrWorkspace from "../features/ocr/components/OcrWorkspace.vue";
import DictionaryDrawer from "../features/translation/components/DictionaryDrawer.vue";
import SegmentActionPopover from "../features/translation/components/SegmentActionPopover.vue";
import { useTranslationWorkspace } from "../features/translation/useTranslationWorkspace";

const {
  PROFILE_SHORTCUTS, sourceText, targetLanguage, profiles, profileId, providerLabel, selectProfileShortcut, onProfileChange,
  maxInputLength, showOriginalText, cleanupNotice, cleanupDismissed, undoCleanupAndRetranslate, isRunning, triggerAiTranslate,
  resultView, showDictionaryTab, showMainDictionary, switchResultView, autoDictionaryResult, dictionaryStatus, dictionaryEligible, dictionarySuggestions, primaryActionLabel,
  status, displayResultText, result, errorMessage, warningMessage, displaySegments, activeSegmentId, copied, copyResult, copySource, copyBilingual, stop, retry,
  handleSegmentHover, toggleSegment, clearSegmentLock, navigateSegment, lookupDictionary,
  ocrResult, ocrError, ocrLoading, captureOcr, copyOcrText, closeOcr, ocrSelectionStyle, selectingOcr, beginOcrSelection, moveOcrSelection, endOcrSelection, cancelOcrSelection, setOcrImage, useOcrBlock, ocrEditedText, applyOcrEditedText,
  dictionaryTerm, dictionaryLoading, dictionaryError, segmentDictionary, closeDictionary, dictionaryContext, dictionaryContextLoading, dictionaryContextText, dictionaryContextError, glossaryFromDictionary, glossaryFromDictionaryNotice, addDictionaryTermToGlossary,
  showRevisionPopover, alternativesLoading, requestAlternatives, addActiveSegmentToGlossary, revisions, lockedSegment, undoRevision, customRevisionInstruction, revisionStatus, reviseSegment, reviseWithCustomInstruction, alternatives, applyAlternative, revisionError, revisionNotice,
  glossaryValidation, sourceTextarea
} = useTranslationWorkspace();
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
    <OcrWorkspace
      :result="ocrResult"
      :error="ocrError"
      :loading="ocrLoading"
      :selection-style="ocrSelectionStyle"
      :selecting="selectingOcr"
      :edited-text="ocrEditedText"
      @retry="captureOcr"
      @copy="copyOcrText"
      @close="closeOcr"
      @begin-selection="beginOcrSelection"
      @move-selection="moveOcrSelection"
      @end-selection="endOcrSelection"
      @cancel-selection="cancelOcrSelection"
      @use-block="useOcrBlock"
      @update:edited-text="ocrEditedText = $event"
      @apply="applyOcrEditedText"
      @image-ref="setOcrImage"
    />
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
          <textarea ref="sourceTextarea" v-model="sourceText" autofocus rows="1" placeholder="输入或粘贴文本，Ctrl + Enter 执行" @keydown.ctrl.enter.prevent="triggerAiTranslate" />
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
        </div>
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
      </section>
    </div>
    <section v-if="glossaryValidation.length" class="glossary-validation-card surface"><div class="panel-toolbar"><span>术语校验</span><small>{{ glossaryValidation.filter((item) => item.applied).length }} / {{ glossaryValidation.length }} 已按术语表使用</small></div><ul><li v-for="item in glossaryValidation" :key="item.sourceTerm" :class="item.applied ? 'glossary-valid' : 'glossary-invalid'">{{ item.applied ? '✓' : '!' }} {{ item.sourceTerm }} → {{ item.targetTerm }}{{ item.applied ? '' : '（译文中未检测到）' }}</li></ul></section>
  </div>
</template>
