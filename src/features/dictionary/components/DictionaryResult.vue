<script setup lang="ts">
import type { DictionaryEntry } from "../../../../electron/shared/types";
import DictionaryCard from "./DictionaryCard.vue";

defineProps<{ entry: DictionaryEntry }>();
const emit = defineEmits<{ saveWord: [entry: DictionaryEntry] }>();
</script>

<template>
  <section class="dictionary-result">
    <DictionaryCard :entry="entry" hide-ai-action @save-word="emit('saveWord', $event)" />
  </section>
</template>

<style scoped>
.dictionary-result :deep(.dictionary-card-panel) { margin: 0; padding: 2px 0 12px; border: 0; background: transparent; }
.dictionary-result :deep(.dictionary-labels),
.dictionary-result :deep(.dictionary-forms),
.dictionary-result :deep(.dictionary-fold),
.dictionary-result :deep(.dictionary-card-actions) { display: none; }
.dictionary-result :deep(.dictionary-senses li:first-child) {
  margin-top: 2px; padding: 8px 10px; border-radius: 8px; background: var(--accent-soft);
}
.dictionary-result :deep(.dictionary-card-header h3) { font-size: 20px; }
.dictionary-result :deep(.dictionary-phonetic) { font-size: 13px; }
</style>
