<script setup lang="ts">
import SegmentedText from "../features/translation/components/SegmentedText.vue";
import DictionaryCompactCard from "../features/dictionary/components/DictionaryCompactCard.vue";
import AppIcon from "../components/AppIcon.vue";
import BrandLogo from "../components/BrandLogo.vue";
import { usePopupWorkflow } from "../features/translation/usePopupWorkflow";

const popup = usePopupWorkflow();
const {
  popupView, sourceText, captureError, capturing, pinned, copied, popupShell, status, result, errorMessage,
  warningMessage, isRunning, retry, displayResult, namingResult, activeSegmentId, hasStructuredResult,
  dictionaryResult, run, triggerAiTranslate, copy, close, togglePin, openMain, handleSegmentHover,
  toggleSegment, clearSegmentLock, navigateSegment, stop
} = popup;
</script>

<template>
  <div ref="popupShell" class="popup-shell popup-vnext">
    <header class="popup-header drag-region">
      <span class="popup-brand"><BrandLogo compact /></span>
      <div class="popup-window-actions no-drag">
        <button type="button" :title="pinned ? '取消固定' : '固定窗口'" :class="{ active: pinned }" @click="togglePin">📌</button>
        <button type="button" title="关闭 (Esc)" @click="close">×</button>
      </div>
    </header>
    <section v-if="capturing" class="popup-state"><span class="spinner" />正在读取选中文字</section>
    <section v-else-if="captureError" class="popup-manual">
      <p>{{ captureError }}</p>
      <textarea v-model="sourceText" autofocus placeholder="粘贴或输入文本" @keydown.ctrl.enter.prevent="run" />
      <button type="button" class="primary-button" @click="run">翻译</button>
    </section>
    <template v-else>
      <section class="popup-source-vnext"><p>{{ sourceText }}</p></section>
      <section class="popup-result-vnext">
        <DictionaryCompactCard v-if="popupView === 'dictionary' && dictionaryResult?.entry" :entry="dictionaryResult.entry" @ai-translate="triggerAiTranslate" />
        <div v-else-if="status === 'loading'" class="popup-state"><span class="soft-loader"><i /><i /><i /></span>正在翻译</div>
        <div v-else-if="status === 'error'" class="popup-error">{{ errorMessage }} <button type="button" @click="retry">重试</button></div>
        <div v-else-if="namingResult" class="popup-candidates">
          <button v-for="candidate in namingResult.candidates" :key="candidate.name" type="button" @click="copy(candidate.name)">
            <code>{{ candidate.name }}</code><small>{{ candidate.meaning }}</small>
          </button>
        </div>
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
        <pre v-else>{{ displayResult }}</pre>
        <p v-if="warningMessage" class="popup-warning">{{ warningMessage }}</p>
      </section>
    </template>
    <footer class="popup-actions">
      <button type="button" class="open-main" @click="openMain">在主窗口打开 ↗</button>
      <div>
        <button v-if="isRunning" type="button" title="停止" @click="stop"><AppIcon name="stop" :size="15" /></button>
        <button type="button" :disabled="!displayResult" title="复制译文" @click="copy()"><AppIcon :name="copied ? 'check' : 'copy'" :size="15" /></button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.popup-vnext {
  height: 100%; display: flex; flex-direction: column;
  border: 1px solid var(--border); border-radius: 10px; background: var(--surface);
  box-shadow: 0 12px 30px rgba(48,56,46,.15); overflow: hidden;
}
.popup-header {
  height: 36px; flex: 0 0 36px; display: flex; align-items: center; justify-content: space-between;
  padding: 0 7px 0 10px; border-bottom: 1px solid var(--border);
}
.popup-brand { display: flex; align-items: center; }
.popup-window-actions { display: flex; }
.popup-window-actions button, .popup-actions button {
  width: 28px; height: 28px; display: grid; place-items: center; border: 0; border-radius: 6px;
  color: var(--muted); background: transparent; cursor: pointer;
}
.popup-window-actions button:hover, .popup-actions button:hover { color: var(--ink); background: var(--surface-soft); }
.popup-window-actions button.active { color: var(--accent-strong); background: var(--accent-soft); }
.popup-source-vnext, .popup-result-vnext { padding: 12px 14px; }
.popup-source-vnext { flex: 0 0 auto; border-bottom: 1px solid var(--border); color: var(--ink-soft); font-size: 13px; }
.popup-source-vnext p { margin: 0; white-space: pre-wrap; }
.popup-result-vnext { flex: 1; min-height: 0; overflow: auto; color: var(--ink); font-size: 14px; line-height: 1.65; }
.popup-result-vnext pre { margin: 0; white-space: pre-wrap; font-family: inherit; }
.popup-result-vnext :deep(.segment-text) { padding: 0; }
.popup-actions {
  min-height: 40px; flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between;
  padding: 6px 10px 6px 12px; border-top: 1px solid var(--border);
}
.popup-actions div { display: flex; gap: 2px; }
.open-main {
  width: auto !important; height: auto !important; padding: 6px 8px !important;
  color: var(--accent-strong) !important; font-size: 12px;
}
.popup-state { min-height: 96px; display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--muted); font-size: 13px; }
.popup-error { color: var(--danger); }
.popup-error button { border: 0; color: var(--danger); background: transparent; cursor: pointer; }
.popup-warning { margin: 9px 0 0; color: var(--warning); font-size: 12px; }
.popup-candidates { display: grid; gap: 6px; }
.popup-candidates button {
  display: grid; gap: 2px; border: 0; border-radius: 8px; padding: 8px 10px; text-align: left;
  background: var(--surface-soft); cursor: pointer;
}
.popup-candidates button:hover { background: var(--accent-soft); }
.popup-manual { display: grid; gap: 10px; padding: 14px; }
</style>
