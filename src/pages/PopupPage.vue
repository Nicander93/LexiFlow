<script setup lang="ts">
import SegmentedText from "../features/translation/components/SegmentedText.vue";
import DictionaryCompactCard from "../features/dictionary/components/DictionaryCompactCard.vue";
import AppIcon from "../components/AppIcon.vue";
import BrandLogo from "../components/BrandLogo.vue";
import { usePopupWorkflow } from "../features/translation/usePopupWorkflow";

const popup = usePopupWorkflow();
const { popupView, sourceText, captureError, capturing, pinned, copied, popupShell, status, result, errorMessage, warningMessage, isRunning, retry, displayResult, namingResult, activeSegmentId, hasStructuredResult, dictionaryResult, run, triggerAiTranslate, copy, close, togglePin, openMain, handleSegmentHover, toggleSegment, clearSegmentLock, navigateSegment, stop } = popup;
</script>

<template>
  <div ref="popupShell" class="popup-shell popup-vnext">
    <header class="popup-header drag-region">
      <span class="popup-brand"><BrandLogo compact /></span>
      <div class="popup-window-actions no-drag"><button :title="pinned ? '取消固定' : '固定窗口'" :class="{ active: pinned }" @click="togglePin">♧</button><button title="关闭 (Esc)" @click="close">×</button></div>
    </header>
    <section v-if="capturing" class="popup-state"><span class="spinner" />正在读取选中文字</section>
    <section v-else-if="captureError" class="popup-manual"><p>{{ captureError }}</p><textarea v-model="sourceText" autofocus placeholder="粘贴或输入文本" @keydown.ctrl.enter.prevent="run" /><button class="primary-button" @click="run">翻译</button></section>
    <template v-else>
      <section class="popup-source-vnext"><p>{{ sourceText }}</p></section>
      <section class="popup-result-vnext">
        <DictionaryCompactCard v-if="popupView === 'dictionary' && dictionaryResult?.entry" :entry="dictionaryResult.entry" @ai-translate="triggerAiTranslate" />
        <div v-else-if="status === 'loading'" class="popup-state"><span class="soft-loader"><i /><i /><i /></span>正在翻译</div>
        <div v-else-if="status === 'error'" class="popup-error">{{ errorMessage }} <button @click="retry">重试</button></div>
        <div v-else-if="namingResult" class="popup-candidates"><button v-for="candidate in namingResult.candidates" :key="candidate.name" @click="copy(candidate.name)"><code>{{ candidate.name }}</code><small>{{ candidate.meaning }}</small></button></div>
        <SegmentedText v-else-if="hasStructuredResult && result" side="target" :segments="result.segments" :active-id="activeSegmentId" @hover="handleSegmentHover" @toggle="toggleSegment" @clear="clearSegmentLock" @navigate="navigateSegment" />
        <pre v-else>{{ displayResult }}</pre>
        <p v-if="warningMessage" class="popup-warning">{{ warningMessage }}</p>
      </section>
    </template>
    <footer class="popup-actions">
      <span>{{ popupView === 'dictionary' ? '本地词典' : pinned ? '已固定' : '点击外部或 Esc 自动关闭' }}</span>
      <div><button v-if="isRunning" title="停止" @click="stop"><AppIcon name="stop" :size="15" /></button><button :disabled="!displayResult" title="复制译文" @click="copy()"><AppIcon :name="copied ? 'check' : 'copy'" :size="15" /></button><button title="在主窗口打开" @click="openMain">↗</button><button title="更多操作">•••</button></div>
    </footer>
  </div>
</template>

<style scoped>
.popup-vnext { min-height: 100%; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); box-shadow: 0 12px 30px rgba(48,56,46,.15); }
.popup-header { height: 36px; display: flex; align-items: center; justify-content: space-between; padding: 0 7px 0 10px; border-bottom: 1px solid var(--border); }.popup-brand { display: flex; align-items: center; }
.popup-window-actions { display: flex; }.popup-window-actions button, .popup-actions button { width: 27px; height: 27px; display: grid; place-items: center; border: 0; border-radius: 5px; color: var(--muted); background: transparent; }.popup-window-actions button:hover, .popup-actions button:hover { color: var(--ink); background: var(--surface-soft); }.popup-window-actions button.active { color: var(--accent-strong); background: var(--accent-soft); }
.popup-source-vnext, .popup-result-vnext { padding: 13px 15px; }.popup-source-vnext { border-bottom: 1px solid var(--border); color: var(--ink-soft); font-size: 12px; }.popup-source-vnext p { margin: 0; white-space: pre-wrap; }.popup-result-vnext { min-height: 86px; color: var(--ink); font-size: 13px; line-height: 1.65; }.popup-result-vnext pre { font-family: inherit; }.popup-result-vnext :deep(.segment-text) { padding: 0; }
.popup-actions { min-height: 39px; display: flex; align-items: center; justify-content: space-between; padding: 5px 9px 5px 14px; border-top: 1px solid var(--border); color: var(--muted); font-size: 9px; }.popup-actions div { display: flex; gap: 2px; }
.popup-state { min-height: 110px; display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--muted); font-size: 11px; }.popup-error { color: var(--danger); }.popup-error button { border: 0; color: var(--danger); background: transparent; }.popup-warning { margin: 9px 0 0; color: var(--warning); font-size: 10px; }
</style>
