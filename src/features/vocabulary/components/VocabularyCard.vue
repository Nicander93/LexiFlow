<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { VocabularyEntry, VocabularyUpsertInput } from "../../../../electron/shared/types";
import AppIcon from "../../../components/AppIcon.vue";
import SpeechButton from "../../speech/SpeechButton.vue";
import InlineConfirm from "../../../components/InlineConfirm.vue";

const props = defineProps<{ entry: VocabularyEntry; busy?: boolean }>();
const emit = defineEmits<{
  save: [input: VocabularyUpsertInput];
  delete: [id: string];
}>();

const translation = ref(props.entry.translation);
const note = ref(props.entry.note ?? "");
const editing = ref(false);
const confirmDelete = ref(false);
const deleteButton = ref<HTMLButtonElement>();
const dirty = computed(() => translation.value !== props.entry.translation || note.value !== (props.entry.note ?? ""));
watch(() => props.entry, (entry) => {
  translation.value = entry.translation;
  note.value = entry.note ?? "";
  editing.value = false;
});

function cancelDelete(): void {
  confirmDelete.value = false;
  void nextTick(() => deleteButton.value?.focus({ preventScroll: true }));
}

function cancelEdit(): void {
  translation.value = props.entry.translation;
  note.value = props.entry.note ?? "";
  editing.value = false;
}

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
    <Transition name="content" @leave="(_, done) => done()">
      <div v-if="editing" key="edit" class="vocabulary-fields">
        <label>释义<textarea v-model="translation" rows="2" /></label>
        <label>笔记<textarea v-model="note" rows="2" placeholder="例句、记忆提示或易混淆词" /></label>
      </div>
      <div v-else key="read" class="vocabulary-fields">
        <p>{{ entry.translation }}</p>
        <p v-if="entry.note" class="muted">{{ entry.note }}</p>
      </div>
    </Transition>
    <p v-if="entry.context" class="word-context">{{ entry.context }}</p>
    <footer>
      <button v-if="!confirmDelete" ref="deleteButton" type="button" class="text-button danger" :disabled="busy" @click="confirmDelete = true"><AppIcon name="trash" :size="14" /> 删除</button>
      <span />
      <template v-if="editing">
        <button type="button" class="text-button" :disabled="busy" @click="cancelEdit">取消修改</button>
        <button type="button" class="primary-button" :disabled="busy || !dirty || !translation.trim()" @click="emit('save', payload())">保存修改</button>
      </template>
      <template v-else>
        <button type="button" class="text-button" :disabled="busy" @click="editing = true">编辑</button>
        <button type="button" class="secondary-button" :disabled="busy" @click="emit('save', payload(entry.status === 'learning' ? 'mastered' : 'learning'))">{{ entry.status === "learning" ? "标记已掌握" : "重新学习" }}</button>
      </template>
    </footer>
    <Transition name="panel"><InlineConfirm v-if="confirmDelete" :message="`从单词本删除“${entry.term}”？`" action="确认删除" :busy="busy" @confirm="emit('delete', entry.id)" @cancel="cancelDelete" /></Transition>
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
footer { flex-wrap: wrap; }
.vocabulary-fields { display: grid; gap: 8px; }
.vocabulary-fields p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
