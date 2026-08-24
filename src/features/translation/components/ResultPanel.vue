<script setup lang="ts">
import type { TranslationSegment, TranslationStatus } from "../../../../electron/shared/types";
import AppIcon from "../../../components/AppIcon.vue";
import SegmentedText from "./SegmentedText.vue";
import SpeechButton from "../../speech/SpeechButton.vue";

defineProps<{
  status: TranslationStatus;
  text: string;
  error?: string;
  warning?: string;
  placeholder?: string;
  sourceText?: string;
  segments?: TranslationSegment[];
  activeSegmentId?: string;
  copied?: boolean;
  targetLanguage?: string;
}>();
const emit = defineEmits<{
  copy: [];
  copySource: [];
  copyBilingual: [];
  stop: [];
  retry: [];
  hover: [id: string | undefined];
  toggle: [id: string];
  clear: [];
  navigate: [id: string];
  selectTerm: [term: string, segmentId: string];
}>();
</script>

<template>
  <section class="result-panel surface">
    <div class="panel-toolbar">
      <slot name="toolbar-start"><span>译文</span></slot>
      <div class="toolbar-actions">
        <SpeechButton v-if="text" :text="text" :language="targetLanguage" icon-only label="朗读译文" />
        <button v-if="status === 'loading' || status === 'streaming'" class="icon-button" title="停止" @click="emit('stop')"><AppIcon name="stop" :size="17" /></button>
        <button v-if="status === 'error' || status === 'cancelled'" class="icon-button" title="重试" @click="emit('retry')"><AppIcon name="refresh" :size="17" /></button>
        <div class="copy-actions">
          <button class="icon-button" title="复制双语" aria-label="复制双语" :disabled="!sourceText || !text" @click="emit('copyBilingual')"><AppIcon :name="copied ? 'check' : 'bilingual'" :size="17" /></button>
          <button class="icon-button" title="复制译文" aria-label="复制译文" :disabled="!text" @click="emit('copy')"><AppIcon :name="copied ? 'check' : 'copy'" :size="17" /></button>
        </div>
      </div>
    </div>
    <div v-if="status === 'error'" class="state-message error-message">{{ error }}</div>
    <div v-else-if="status === 'loading'" class="state-message state-message--stack"><span class="soft-loader"><i /><i /><i /></span><strong>正在唤醒模型</strong><small>第一段内容很快会出现在这里</small></div>
    <div v-else-if="!text" class="state-message state-message--stack muted"><span class="empty-orb"><AppIcon name="sparkle" :size="25" /></span><strong>{{ placeholder || '译文会在这里流动起来' }}</strong><small>保留段落、代码与换行，不额外发挥</small></div>
    <template v-else>
      <div v-if="warning" class="state-message warning-message">{{ warning }}</div>
      <SegmentedText
        v-if="segments?.length"
        side="target"
        :segments="segments"
        :active-id="activeSegmentId"
        @hover="emit('hover', $event)"
        @toggle="emit('toggle', $event)"
        @clear="emit('clear')"
        @navigate="emit('navigate', $event)"
        @select-term="(term, segmentId) => emit('selectTerm', term, segmentId)"
      />
      <pre v-else class="result-text">{{ text }}<span v-if="status === 'streaming'" class="stream-cursor" /></pre>
    </template>
  </section>
</template>
