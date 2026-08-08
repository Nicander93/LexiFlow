<script setup lang="ts">
import SegmentedText from "../features/translation/components/SegmentedText.vue";
import DictionaryCompactCard from "../features/dictionary/components/DictionaryCompactCard.vue";
import AppIcon from "../components/AppIcon.vue";
import { usePopupWorkflow } from "../features/translation/usePopupWorkflow";

const {
  popupView, sourceText, captureError, capturing, pinned, profiles, profileId, copied, sourceExpanded, popupShell,
  status, result, errorMessage, warningMessage, isRunning, retry, displayResult, namingResult, activeSegmentId, hasStructuredResult, showDictionaryTab, dictionaryResult,
  run, selectView, triggerAiTranslate, copy, close, togglePin, openMain, handleSegmentHover, toggleSegment, clearSegmentLock, navigateSegment, stop
} = usePopupWorkflow();
</script>

<template>
  <div ref="popupShell" class="popup-shell">
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
        <SegmentedText v-if="sourceExpanded && hasStructuredResult && result" side="source" :segments="result.segments" :active-id="activeSegmentId" @hover="handleSegmentHover" @toggle="toggleSegment" @clear="clearSegmentLock" @navigate="navigateSegment" />
        <pre v-else-if="sourceExpanded">{{ sourceText }}</pre>
      </section>
      <section class="popup-result">
        <DictionaryCompactCard v-if="popupView === 'dictionary' && dictionaryResult?.entry" :entry="dictionaryResult.entry" @ai-translate="triggerAiTranslate" />
        <div v-else-if="status === 'loading'" class="popup-state"><span class="spinner" />正在等待模型响应…</div>
        <div v-else-if="status === 'error'" class="popup-error">{{ errorMessage }}</div>
        <template v-else-if="namingResult">
          <div v-if="warningMessage" class="popup-warning">{{ warningMessage }}</div>
          <div class="popup-candidates"><button v-for="candidate in namingResult.candidates" :key="candidate.name" @click="copy(candidate.name)"><code>{{ candidate.name }}</code><small>{{ candidate.meaning }}</small></button></div>
        </template>
        <template v-else-if="hasStructuredResult && result">
          <div v-if="warningMessage" class="popup-warning">{{ warningMessage }}</div>
          <SegmentedText side="target" :segments="result.segments" :active-id="activeSegmentId" @hover="handleSegmentHover" @toggle="toggleSegment" @clear="clearSegmentLock" @navigate="navigateSegment" />
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
        <button v-if="isRunning" class="icon-button" title="停止" aria-label="停止" @click="stop"><AppIcon name="stop" :size="16" /></button>
        <button v-if="status === 'error'" class="icon-button" title="重试" aria-label="重试" @click="retry"><AppIcon name="refresh" :size="16" /></button>
        <button class="icon-button" :disabled="!sourceText" title="复制原文" aria-label="复制原文" @click="copy(sourceText)"><AppIcon :name="copied ? 'check' : 'copy'" :size="16" /></button>
        <button class="icon-button" :disabled="!sourceText || !displayResult" title="复制原文和译文" aria-label="复制原文和译文" @click="copy(`原文：${sourceText}\n\n译文：${displayResult}`)"><AppIcon name="bilingual" :size="16" /></button>
        <button class="icon-button" :disabled="!displayResult" title="复制译文" aria-label="复制译文" @click="copy()"><AppIcon :name="copied ? 'check' : 'copy'" :size="16" /></button>
        <button @click="openMain">主窗口</button>
      </div>
    </footer>
  </div>
</template>
