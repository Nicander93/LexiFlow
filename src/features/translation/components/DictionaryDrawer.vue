<script setup lang="ts">
import type { DictionaryEntry, DictionaryLookupResult, TranslationSegment } from "../../../../electron/shared/types";
import DictionaryCard from "../../dictionary/components/DictionaryCard.vue";

defineProps<{
  term: string;
  loading: boolean;
  error: string;
  lookup: DictionaryLookupResult | null;
  context?: TranslationSegment;
  contextLoading: boolean;
  contextText: string;
  contextError: string;
  sourceTerm: string;
  targetTerm: string;
  notice: string;
}>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "ai-translate"): void;
  (event: "request-context"): void;
  (event: "update:source-term", value: string): void;
  (event: "update:target-term", value: string): void;
  (event: "add-term"): void;
  (event: "save-word", entry: DictionaryEntry): void;
}>();
</script>

<template>
  <section v-if="term" class="context-panel dictionary-card surface" aria-live="polite">
    <div class="context-panel__header">
      <strong>词典</strong>
      <button class="context-panel__close" type="button" title="关闭词典" aria-label="关闭词典" @click="emit('close')">×</button>
    </div>
    <div v-if="loading" class="state-message muted"><span class="spinner" />正在查询本地词典</div>
    <div v-else-if="lookup?.entry" class="dictionary-content">
      <DictionaryCard :entry="lookup.entry" variant="context" hide-ai-action @save-word="emit('save-word', $event)" />
      <details class="dictionary-advanced">
        <summary>上下文与术语</summary>
        <div v-if="context" class="dictionary-context">
          <small>当前句段</small>
          <p>{{ context.source }}</p>
          <p>{{ context.target }}</p>
          <button v-if="!contextText && !contextLoading" class="secondary-button" type="button" @click="emit('request-context')">结合上下文解释</button>
        </div>
        <div v-if="contextLoading || contextText || contextError" class="dictionary-context">
          <small>上下文解释</small>
          <p v-if="contextLoading" class="muted"><span class="spinner" />正在补充释义…</p>
          <p v-else-if="contextText">{{ contextText }}</p>
          <p v-else class="error-text">{{ contextError }}</p>
        </div>
        <div class="dictionary-glossary">
          <strong>加入术语表</strong>
          <div class="form-grid"><label>源词<input :value="sourceTerm" @input="emit('update:source-term', ($event.target as HTMLInputElement).value)" /></label><label>目标词<input :value="targetTerm" placeholder="固定译法" @input="emit('update:target-term', ($event.target as HTMLInputElement).value)" /></label></div>
          <button class="secondary-button" type="button" @click="emit('add-term')">保存术语</button>
          <small v-if="notice" class="muted">{{ notice }}</small>
        </div>
      </details>
    </div>
    <div v-else-if="error" class="state-message error-message">{{ error }}</div>
    <div v-else class="state-message state-message--stack muted">
      <span>{{ lookup?.unavailableReason || '本地词典暂未收录该词或短语。' }}</span>
      <span v-if="lookup?.suggestions?.length" class="dictionary-hint muted">建议：{{ lookup.suggestions.join('、') }}</span>
      <button class="secondary-button" type="button" @click="emit('ai-translate')">按文本翻译</button>
    </div>
  </section>
</template>
