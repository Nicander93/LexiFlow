<script setup lang="ts">
import AppIcon from "../../../components/AppIcon.vue";
import type { TranslationSegment } from "../../../../electron/shared/types";
import SegmentedText from "./SegmentedText.vue";

defineProps<{
  segments: TranslationSegment[];
  activeSegmentId?: string;
}>();

const emit = defineEmits<{
  "copy-source": [];
  copy: [];
  hover: [id: string | undefined];
  toggle: [id: string];
  clear: [];
  navigate: [id: string];
  "select-term": [term: string, segmentId?: string];
}>();
</script>

<template>
  <section class="bilingual-reading">
    <div>
      <header>原文 <button type="button" @click="emit('copy-source')"><AppIcon name="copy" :size="14" /></button></header>
      <SegmentedText
        side="source"
        :segments="segments"
        :active-id="activeSegmentId"
        @hover="emit('hover', $event)"
        @toggle="emit('toggle', $event)"
        @clear="emit('clear')"
        @navigate="emit('navigate', $event)"
      />
    </div>
    <div>
      <header>译文 <button type="button" @click="emit('copy')"><AppIcon name="copy" :size="14" /></button></header>
      <SegmentedText
        side="target"
        :segments="segments"
        :active-id="activeSegmentId"
        @hover="emit('hover', $event)"
        @toggle="emit('toggle', $event)"
        @clear="emit('clear')"
        @navigate="emit('navigate', $event)"
        @select-term="(term, id) => emit('select-term', term, id)"
      />
    </div>
  </section>
</template>

<style scoped>
.bilingual-reading {
  flex: 1; min-height: 260px; display: grid; grid-template-columns: 1fr 1fr;
  border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--surface);
}
.bilingual-reading > div { min-width: 0; overflow: auto; }
.bilingual-reading > div + div { border-left: 1px solid var(--border); background: var(--accent-faint); }
header {
  height: 36px; display: flex; align-items: center; justify-content: space-between;
  padding: 0 12px; border-bottom: 1px solid var(--border); color: var(--muted); font-size: 12px;
}
header button { border: 0; color: var(--muted); background: none; cursor: pointer; }
@media (max-width: 720px) {
  .bilingual-reading { grid-template-columns: 1fr; }
  .bilingual-reading > div + div { border-left: 0; border-top: 1px solid var(--border); }
}
</style>
