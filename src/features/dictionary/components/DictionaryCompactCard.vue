<script setup lang="ts">
import type { DictionaryEntry } from "../../../../electron/shared/types";
import AppIcon from "../../../components/AppIcon.vue";
import SpeechButton from "../../speech/SpeechButton.vue";
import DictionarySenses from "./DictionarySenses.vue";
import DictionaryLabels from "./DictionaryLabels.vue";
import WordForms from "./WordForms.vue";

defineProps<{
  entry: DictionaryEntry;
}>();

const emit = defineEmits<{
  aiTranslate: [];
  saveWord: [entry: DictionaryEntry];
}>();
</script>

<template>
  <article class="dictionary-compact-card">
    <header class="dictionary-card-header">
      <strong>{{ entry.headword }}</strong>
      <span v-if="entry.phonetic" class="dictionary-phonetic">{{ entry.phonetic }}</span>
      <button class="icon-button" type="button" title="加入生词本" aria-label="加入生词本" @click="emit('saveWord', entry)"><AppIcon name="star" :size="14" /></button>
    </header>
    <div class="dictionary-phonetic-row">
      <SpeechButton :text="entry.headword" language="en-GB" label="英音" />
      <SpeechButton :text="entry.headword" language="en-US" label="美音" />
    </div>
    <div class="dictionary-compact-scroll">
      <DictionarySenses :senses="entry.senses" :limit="4" />
      <DictionaryLabels :labels="entry.labels" />
      <WordForms :forms="entry.forms" compact />
    </div>
    <button class="secondary-button" type="button" @click="emit('aiTranslate')">按文本翻译</button>
  </article>
</template>
