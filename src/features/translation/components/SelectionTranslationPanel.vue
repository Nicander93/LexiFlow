<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import type { TranslationState } from "../../../../electron/shared/types";

defineProps<{ sourceText: string; state: TranslationState; targetLanguage: string; copied: boolean }>();
const emit = defineEmits<{ close: []; cancel: []; retry: []; copy: [] }>();
const panel = ref<HTMLElement>();
onMounted(() => { void nextTick(() => panel.value?.scrollIntoView({ block: "nearest" })); });
</script>

<template>
  <section v-if="sourceText" ref="panel" class="selection-translation-panel surface" aria-label="选中内容翻译">
    <header><strong>选中内容翻译 · {{ targetLanguage === 'en' ? '中文 → 英文' : '英文 → 中文' }}</strong><button type="button" aria-label="关闭选区翻译" @click="emit('close')">×</button></header>
    <p class="selection-source" data-selection-text>{{ sourceText }}</p>
    <div aria-live="polite">
      <p v-if="state.status === 'loading' || state.status === 'streaming'" class="muted">正在翻译选中内容… <button class="text-button" type="button" @click="emit('cancel')">取消</button></p>
      <p v-if="state.content" class="selection-target" data-selection-text>{{ state.content }}</p>
      <p v-if="state.error" class="error-text">{{ state.error }}</p>
      <p v-else-if="state.status === 'cancelled'" class="muted">已取消选区翻译。</p>
    </div>
    <footer>
      <button v-if="state.content" class="secondary-button" type="button" @click="emit('copy')">{{ copied ? '已复制选区译文' : '复制选区译文' }}</button>
      <button v-if="state.status === 'success' || state.status === 'error' || state.status === 'cancelled'" class="text-button" type="button" @click="emit('retry')">重新翻译选区</button>
    </footer>
  </section>
</template>

<style scoped>
.selection-translation-panel { flex: 0 0 auto; margin: 0 4px; padding: 0 14px 12px; border: 1px solid var(--border); border-radius: 10px; }
header { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 38px; font-size: 12px; }
header button { border: 0; color: var(--muted); background: transparent; font-size: 20px; cursor: pointer; }
.selection-source, .selection-target { white-space: pre-wrap; overflow-wrap: anywhere; margin: 8px 0; line-height: 1.65; }
.selection-source { color: var(--ink-soft); font-size: 13px; border-top: 1px solid var(--border); padding-top: 10px; }
.selection-target { font-size: 15px; }
footer { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
