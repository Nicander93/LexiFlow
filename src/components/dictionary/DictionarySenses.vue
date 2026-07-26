<script setup lang="ts">
import type { DictionarySense } from "../../../electron/shared/types";

defineProps<{
  senses: DictionarySense[];
  limit?: number;
}>();
</script>

<template>
  <ul class="dictionary-senses">
    <li v-for="(sense, index) in (limit ? senses.slice(0, limit) : senses)" :key="`${sense.partOfSpeech ?? 'x'}-${index}`">
      <strong v-if="sense.partOfSpeech">{{ sense.partOfSpeech }}</strong>
      <span>{{ sense.translations.join("；") }}</span>
    </li>
  </ul>
</template>
