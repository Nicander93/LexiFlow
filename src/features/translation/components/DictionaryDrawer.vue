<script setup lang="ts">
import type { DictionaryLookupResult, TranslationSegment } from "../../../../electron/shared/types";
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
  (event: "update:source-term", value: string): void;
  (event: "update:target-term", value: string): void;
  (event: "add-term"): void;
}>();
</script>

<template>
  <section v-if="term" class="dictionary-card surface" aria-live="polite">
    <div class="panel-toolbar"><span>词典 · {{ term }}</span><button class="text-button" @click="emit('close')">关闭</button></div>
    <div v-if="loading" class="state-message muted"><span class="spinner" />正在查询本地词典</div>
    <div v-else-if="lookup?.entry" class="dictionary-content">
      <DictionaryCard :entry="lookup.entry" @ai-translate="emit('ai-translate')" />
      <div v-if="context" class="dictionary-context"><small>当前双语上下文</small><p>{{ context.source }}</p><p>{{ context.target }}</p></div>
      <div v-if="contextLoading || contextText || contextError" class="dictionary-context"><small>模型补充解释</small><p v-if="contextLoading" class="muted">正在补充释义…</p><p v-else-if="contextText">{{ contextText }}</p><p v-else class="error-text">{{ contextError }}</p></div>
      <div class="dictionary-glossary">
        <small>加入术语表前请确认源词与目标词（不要直接把整段释义当译文）</small>
        <div class="form-grid"><label>源词<input :value="sourceTerm" @input="emit('update:source-term', ($event.target as HTMLInputElement).value)" /></label><label>目标词<input :value="targetTerm" placeholder="固定译法" @input="emit('update:target-term', ($event.target as HTMLInputElement).value)" /></label></div>
        <button class="secondary-button" @click="emit('add-term')">加入术语表</button>
        <small v-if="notice" class="muted">{{ notice }}</small>
      </div>
    </div>
    <div v-else-if="error" class="state-message error-message">{{ error }}</div>
    <div v-else class="state-message muted">{{ lookup?.unavailableReason || '本地词典暂未收录该词或短语。' }}<p v-if="lookup?.suggestions?.length" class="dictionary-hint muted">建议：{{ lookup.suggestions.join('、') }}</p></div>
  </section>
</template>
