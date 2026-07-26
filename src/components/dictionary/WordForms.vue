<script setup lang="ts">
import { computed } from "vue";
import type { DictionaryForm } from "../../../electron/shared/types";

const props = defineProps<{
  forms: DictionaryForm[];
  compact?: boolean;
}>();

const grouped = computed(() => {
  const map = new Map<string, string[]>();
  for (const form of props.forms) {
    const labels = map.get(form.value) ?? [];
    if (!labels.includes(form.label)) labels.push(form.label);
    map.set(form.value, labels);
  }
  return [...map.entries()].map(([value, labels]) => ({ value, label: labels.join(" / ") }));
});

const visible = computed(() => (props.compact ? grouped.value.slice(0, 3) : grouped.value));
</script>

<template>
  <ul v-if="visible.length" class="dictionary-forms">
    <li v-for="item in visible" :key="`${item.label}-${item.value}`">
      <span>{{ item.label }}：</span><strong>{{ item.value }}</strong>
    </li>
  </ul>
</template>
