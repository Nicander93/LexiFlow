<script setup lang="ts">
import type { DictionaryLabels } from "../../../../electron/shared/types";

defineProps<{
  labels: DictionaryLabels;
}>();
</script>

<template>
  <div v-if="labels.exams.length || labels.oxford3000 || labels.collinsStars" class="dictionary-labels">
    <span v-for="exam in labels.exams" :key="exam" class="dictionary-tag">{{ exam }}</span>
    <span v-if="labels.oxford3000" class="dictionary-tag">Oxford 3000</span>
    <span v-if="labels.collinsStars" class="dictionary-tag">Collins {{ "★".repeat(labels.collinsStars) }}</span>
  </div>
</template>
