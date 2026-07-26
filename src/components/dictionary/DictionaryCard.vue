<script setup lang="ts">
import { computed, ref } from "vue";
import type { DictionaryEntry } from "../../../electron/shared/types";
import { canSpeakEnglish, speakEnglish } from "../../services/speech";
import DictionarySenses from "./DictionarySenses.vue";
import DictionaryLabels from "./DictionaryLabels.vue";
import WordForms from "./WordForms.vue";

const props = defineProps<{
  entry: DictionaryEntry;
}>();

const emit = defineEmits<{
  aiTranslate: [];
}>();

const showDefinitions = ref(false);
const showMeta = ref(false);
const speechAvailable = computed(() => canSpeakEnglish());
const hasDefinitions = computed(() => props.entry.senses.some((sense) => sense.definitions?.length));
const hasMeta = computed(() => Boolean(props.entry.labels.bncRank || props.entry.labels.contemporaryRank));

async function copyHeadword(): Promise<void> {
  await navigator.clipboard?.writeText(props.entry.headword);
}

function speak(lang: "en-GB" | "en-US"): void {
  speakEnglish(props.entry.headword, lang);
}
</script>

<template>
  <article class="dictionary-card-panel">
    <header class="dictionary-card-header">
      <h3>{{ entry.headword }}</h3>
      <button class="text-button" type="button" @click="copyHeadword">复制</button>
    </header>
    <div class="dictionary-phonetic-row">
      <span v-if="entry.phonetic" class="dictionary-phonetic">{{ entry.phonetic }}</span>
      <button class="text-button" type="button" :disabled="!speechAvailable" :title="speechAvailable ? '英音' : '当前系统未安装可用的英文语音。'" @click="speak('en-GB')">英音</button>
      <button class="text-button" type="button" :disabled="!speechAvailable" :title="speechAvailable ? '美音' : '当前系统未安装可用的英文语音。'" @click="speak('en-US')">美音</button>
    </div>
    <DictionarySenses :senses="entry.senses" />
    <DictionaryLabels :labels="entry.labels" />
    <WordForms :forms="entry.forms" />
    <details v-if="hasDefinitions" class="dictionary-fold" :open="showDefinitions" @toggle="showDefinitions = ($event.target as HTMLDetailsElement).open">
      <summary>英文释义</summary>
      <ul>
        <template v-for="(sense, index) in entry.senses" :key="`def-${index}`">
          <li v-for="definition in sense.definitions ?? []" :key="definition">{{ definition }}</li>
        </template>
      </ul>
    </details>
    <details v-if="hasMeta" class="dictionary-fold" :open="showMeta" @toggle="showMeta = ($event.target as HTMLDetailsElement).open">
      <summary>词汇信息</summary>
      <p v-if="entry.labels.bncRank">BNC：{{ entry.labels.bncRank }}</p>
      <p v-if="entry.labels.contemporaryRank">当代词频：{{ entry.labels.contemporaryRank }}</p>
    </details>
    <div class="dictionary-card-actions">
      <button class="secondary-button" type="button" @click="emit('aiTranslate')">AI 翻译</button>
    </div>
  </article>
</template>
