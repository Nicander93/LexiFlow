<script setup lang="ts">
import type { TranslationSegment, TranslationStatus } from "../../electron/shared/types";
import AppIcon from "./AppIcon.vue";
import SegmentedText from "./SegmentedText.vue";

defineProps<{
  status: TranslationStatus;
  text: string;
  error?: string;
  placeholder?: string;
  sourceText?: string;
  segments?: TranslationSegment[];
  activeSegmentId?: string;
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
      <slot name="toolbar-start"><span>处理结果</span></slot>
      <div class="toolbar-actions">
        <button v-if="status === 'loading' || status === 'streaming'" class="icon-button" title="停止" @click="emit('stop')"><AppIcon name="stop" :size="17" /></button>
        <button v-if="status === 'error' || status === 'cancelled'" class="icon-button" title="重试" @click="emit('retry')"><AppIcon name="refresh" :size="17" /></button>
        <button class="icon-button" title="复制原文" :disabled="!sourceText" @click="emit('copySource')"><AppIcon name="copy" :size="17" /></button>
        <button class="icon-button" title="复制双语" :disabled="!sourceText || !text" @click="emit('copyBilingual')">双</button>
        <button class="icon-button" title="复制结果" :disabled="!text" @click="emit('copy')"><AppIcon name="copy" :size="17" /></button>
      </div>
    </div>
    <div v-if="status === 'error'" class="state-message error-message">{{ error }}</div>
    <div v-else-if="status === 'loading'" class="state-message state-message--stack"><span class="soft-loader"><i /><i /><i /></span><strong>正在唤醒模型</strong><small>第一段内容很快会出现在这里</small></div>
    <div v-else-if="!text" class="state-message state-message--stack muted"><span class="empty-orb"><AppIcon name="sparkle" :size="25" /></span><strong>{{ placeholder || '译文会在这里流动起来' }}</strong><small>保留段落、代码与换行，不额外发挥</small></div>
    <SegmentedText
      v-else-if="segments?.length"
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
  </section>
</template>
