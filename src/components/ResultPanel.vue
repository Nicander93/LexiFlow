<script setup lang="ts">
import type { TranslationStatus } from "../../electron/shared/types";
import AppIcon from "./AppIcon.vue";

defineProps<{ status: TranslationStatus; text: string; error?: string; placeholder?: string }>();
const emit = defineEmits<{ copy: []; stop: []; retry: [] }>();
</script>

<template>
  <section class="result-panel surface">
    <div class="panel-toolbar">
      <span>处理结果</span>
      <div class="toolbar-actions">
        <button v-if="status === 'loading' || status === 'streaming'" class="icon-button" title="停止" @click="emit('stop')"><AppIcon name="stop" :size="17" /></button>
        <button v-if="status === 'error' || status === 'cancelled'" class="icon-button" title="重试" @click="emit('retry')"><AppIcon name="refresh" :size="17" /></button>
        <button class="icon-button" title="复制结果" :disabled="!text" @click="emit('copy')"><AppIcon name="copy" :size="17" /></button>
      </div>
    </div>
    <div v-if="status === 'error'" class="state-message error-message">{{ error }}</div>
    <div v-else-if="status === 'loading'" class="state-message state-message--stack"><span class="soft-loader"><i /><i /><i /></span><strong>正在唤醒模型</strong><small>第一段内容很快会出现在这里</small></div>
    <div v-else-if="!text" class="state-message state-message--stack muted"><span class="empty-orb"><AppIcon name="sparkle" :size="25" /></span><strong>{{ placeholder || '译文会在这里流动起来' }}</strong><small>保留段落、代码与换行，不额外发挥</small></div>
    <pre v-else class="result-text">{{ text }}<span v-if="status === 'streaming'" class="stream-cursor" /></pre>
  </section>
</template>
