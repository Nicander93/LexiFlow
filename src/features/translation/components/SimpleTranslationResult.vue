<script setup lang="ts">
import AppIcon from "../../../components/AppIcon.vue";
import type { TranslationSegment } from "../../../../electron/shared/types";
import SegmentedText from "./SegmentedText.vue";

defineProps<{
  text: string;
  segments: TranslationSegment[];
  activeSegmentId?: string;
}>();

const emit = defineEmits<{
  copy: [];
  retry: [];
  "copy-source": [];
  "copy-bilingual": [];
  hover: [id: string | undefined];
  toggle: [id: string];
  clear: [];
  navigate: [id: string];
  "select-term": [term: string, segmentId?: string];
}>();

</script>

<template>
  <section class="simple-translation">
    <div class="simple-target">
      <SegmentedText
        v-if="segments.length"
        side="target"
        :segments="segments"
        :active-id="activeSegmentId"
        @hover="emit('hover', $event)"
        @toggle="emit('toggle', $event)"
        @clear="emit('clear')"
        @navigate="emit('navigate', $event)"
        @select-term="(term, id) => emit('select-term', term, id)"
      />
      <p v-else>{{ text }}</p>
    </div>
    <footer>
      <button type="button" title="复制译文" @click="emit('copy')"><AppIcon name="copy" :size="15" /> 复制译文</button>
      <button type="button" title="重新翻译" @click="emit('retry')">重新翻译</button>
    </footer>
  </section>
</template>

<style scoped>
.simple-translation { flex: 1; min-height: 0; padding: 8px 2px 12px; }
.simple-target { min-height: 72px; padding: 8px 0 14px; }
.simple-target :deep(.segment-text) { padding: 0; font-size: 16px; font-weight: 600; line-height: 1.7; }
.simple-target p { margin: 0; font-size: 16px; line-height: 1.7; font-weight: 600; }
footer { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
footer > button {
  min-height: 30px; display: inline-flex; align-items: center; gap: 5px;
  border: 0; border-radius: 6px; padding: 0 10px; color: var(--ink-soft); background: transparent; font-size: 13px; cursor: pointer;
}
footer > button:hover { background: var(--surface-soft); color: var(--ink); }
</style>
