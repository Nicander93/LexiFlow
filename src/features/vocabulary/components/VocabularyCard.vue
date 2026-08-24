<script setup lang="ts">
import { ref, watch } from "vue";
import type { VocabularyEntry, VocabularyUpsertInput } from "../../../../electron/shared/types";
import AppIcon from "../../../components/AppIcon.vue";
import SpeechButton from "../../speech/SpeechButton.vue";

const props = defineProps<{ entry: VocabularyEntry }>();
const emit = defineEmits<{
  save: [input: VocabularyUpsertInput];
  delete: [id: string];
}>();

const translation = ref(props.entry.translation);
const note = ref(props.entry.note ?? "");
watch(() => props.entry, (entry) => {
  translation.value = entry.translation;
  note.value = entry.note ?? "";
});

function payload(status = props.entry.status): VocabularyUpsertInput {
  return {
    id: props.entry.id,
    term: props.entry.term,
    translation: translation.value,
    phonetic: props.entry.phonetic,
    sourceLanguage: props.entry.sourceLanguage,
    targetLanguage: props.entry.targetLanguage,
    context: props.entry.context,
    note: note.value,
    status,
    createdAt: props.entry.createdAt
  };
}
</script>

<template>
  <article class="vocabulary-card surface">
    <header>
      <div><strong>{{ entry.term }}</strong><span v-if="entry.phonetic">/{{ entry.phonetic }}/</span></div>
      <div>
        <span class="status-badge" :class="entry.status">{{ entry.status === "learning" ? "学习中" : "已掌握" }}</span>
        <SpeechButton :text="entry.term" :language="entry.sourceLanguage" icon-only label="朗读单词" />
      </div>
    </header>
    <label>释义<textarea v-model="translation" rows="2" /></label>
    <p v-if="entry.context" class="word-context">{{ entry.context }}</p>
    <label>笔记<textarea v-model="note" rows="2" placeholder="例句、记忆提示或易混淆词" /></label>
    <footer>
      <button type="button" class="text-button danger" @click="emit('delete', entry.id)"><AppIcon name="trash" :size="14" /> 删除</button>
      <span />
      <button type="button" class="secondary-button" @click="emit('save', payload(entry.status === 'learning' ? 'mastered' : 'learning'))">{{ entry.status === "learning" ? "标记已掌握" : "重新学习" }}</button>
      <button type="button" class="primary-button" @click="emit('save', payload())">保存修改</button>
    </footer>
  </article>
</template>

<style scoped>
.vocabulary-card { display: grid; gap: 11px; padding: 15px; }
header, header > div, footer { display: flex; align-items: center; gap: 8px; }
header { justify-content: space-between; }
header strong { font-size: 19px; }
header span { color: var(--muted); font-size: 12px; }
label { display: grid; gap: 5px; color: var(--muted); font-size: 12px; }
textarea { resize: vertical; min-height: 44px; font-family: inherit; }
.word-context { margin: 0; padding: 8px 10px; border-left: 2px solid var(--accent); color: var(--ink-soft); background: var(--accent-faint); font-size: 13px; }
.status-badge { border-radius: 999px; padding: 3px 7px; background: var(--surface-soft); }
.status-badge.learning { color: var(--accent-strong); background: var(--accent-soft); }
footer span { flex: 1; }
footer button { display: inline-flex; align-items: center; gap: 5px; }
</style>
