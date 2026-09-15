<script setup lang="ts">
import { computed, ref } from "vue";
import AppIcon from "../../../components/AppIcon.vue";
import type { DictionaryEntry } from "../../../../electron/shared/types";
import SpeechButton from "../../speech/SpeechButton.vue";
import DictionarySenses from "./DictionarySenses.vue";
import DictionaryLabels from "./DictionaryLabels.vue";
import WordForms from "./WordForms.vue";

const props = withDefaults(defineProps<{
  entry: DictionaryEntry;
  hideAiAction?: boolean;
  variant?: "full" | "context";
}>(), { hideAiAction: false, variant: "full" });

const emit = defineEmits<{
  aiTranslate: [];
  saveWord: [entry: DictionaryEntry];
}>();

const showDefinitions = ref(false);
const showMeta = ref(false);
const showMore = ref(false);
const copied = ref(false);
const isContext = computed(() => props.variant === "context");
const hasDefinitions = computed(() => props.entry.senses.some((sense) => sense.definitions?.length));
const hasMeta = computed(() => Boolean(props.entry.labels.bncRank || props.entry.labels.contemporaryRank));

async function copyHeadword(): Promise<void> {
  await navigator.clipboard?.writeText(props.entry.headword);
  copied.value = true;
  window.setTimeout(() => { copied.value = false; }, 1400);
}

</script>

<template>
  <article class="dictionary-card-panel" :class="{ 'dictionary-card-panel--context': isContext }">
    <header class="dictionary-card-header">
      <div class="dictionary-card-title">
        <h3>{{ entry.headword }}</h3>
        <span v-if="isContext && entry.phonetic" class="dictionary-phonetic">{{ entry.phonetic }}</span>
      </div>
      <div class="dictionary-card-header-actions">
        <SpeechButton v-if="isContext" :text="entry.headword" language="en-US" icon-only label="朗读" />
        <button class="icon-button" type="button" title="加入生词本" aria-label="加入生词本" @click="emit('saveWord', entry)"><AppIcon name="star" :size="15" /></button>
        <button class="icon-button dictionary-copy-button" type="button" :title="copied ? '已复制' : '复制词头'" :aria-label="copied ? '已复制' : '复制词头'" @click="copyHeadword"><AppIcon :name="copied ? 'check' : 'copy'" :size="15" /></button>
      </div>
    </header>
    <div v-if="!isContext" class="dictionary-phonetic-row">
      <span v-if="entry.phonetic" class="dictionary-phonetic">{{ entry.phonetic }}</span>
      <SpeechButton :text="entry.headword" language="en-GB" label="英音" />
      <SpeechButton :text="entry.headword" language="en-US" label="美音" />
    </div>
    <DictionarySenses :senses="entry.senses" :limit="isContext && !showMore ? 2 : undefined" />
    <button v-if="isContext" class="dictionary-more-button" type="button" :aria-expanded="showMore" @click="showMore = !showMore">
      {{ showMore ? "收起详细信息" : "更多释义与词汇信息" }}
      <AppIcon name="chevron" :size="13" />
    </button>
    <div v-if="!isContext || showMore" class="dictionary-card-details">
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
      <div v-if="!hideAiAction" class="dictionary-card-actions">
        <button class="text-button" type="button" @click="emit('aiTranslate')">按文本翻译</button>
      </div>
    </div>
  </article>
</template>
