<script setup lang="ts">
import { computed } from "vue";
import type { DictionaryEntry } from "../../../../electron/shared/types";
import { canSpeakEnglish, speakEnglish } from "../speech";
import DictionarySenses from "./DictionarySenses.vue";
import DictionaryLabels from "./DictionaryLabels.vue";
import WordForms from "./WordForms.vue";

const props = defineProps<{
  entry: DictionaryEntry;
}>();

const emit = defineEmits<{
  aiTranslate: [];
}>();

const speechAvailable = computed(() => canSpeakEnglish());

function speak(lang: "en-GB" | "en-US"): void {
  speakEnglish(props.entry.headword, lang);
}
</script>

<template>
  <article class="dictionary-compact-card">
    <header class="dictionary-card-header">
      <strong>{{ entry.headword }}</strong>
      <span v-if="entry.phonetic" class="dictionary-phonetic">{{ entry.phonetic }}</span>
    </header>
    <div class="dictionary-phonetic-row">
      <button class="text-button" type="button" :disabled="!speechAvailable" :title="speechAvailable ? '英音' : '当前系统未安装可用的英文语音。'" @click="speak('en-GB')">英音</button>
      <button class="text-button" type="button" :disabled="!speechAvailable" :title="speechAvailable ? '美音' : '当前系统未安装可用的英文语音。'" @click="speak('en-US')">美音</button>
    </div>
    <div class="dictionary-compact-scroll">
      <DictionarySenses :senses="entry.senses" :limit="4" />
      <DictionaryLabels :labels="entry.labels" />
      <WordForms :forms="entry.forms" compact />
    </div>
    <button class="secondary-button" type="button" @click="emit('aiTranslate')">AI 翻译</button>
  </article>
</template>
