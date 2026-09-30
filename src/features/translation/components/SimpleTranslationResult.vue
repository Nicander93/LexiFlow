<script setup lang="ts">
import AppIcon from "../../../components/AppIcon.vue";
import type { TranslationSegment } from "../../../../electron/shared/types";
import SegmentedText from "./SegmentedText.vue";
import SpeechButton from "../../speech/SpeechButton.vue";

defineProps<{
  text: string;
  segments: TranslationSegment[];
  activeSegmentId?: string;
  targetLanguage?: string;
  adjustable?: boolean;
  copied?: boolean;
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
        :adjustable="adjustable"
        @hover="emit('hover', $event)"
        @toggle="emit('toggle', $event)"
        @clear="emit('clear')"
        @navigate="emit('navigate', $event)"
        @select-term="(term, id) => emit('select-term', term, id)"
      />
      <p v-else data-selection-text>{{ text }}</p>
    </div>
    <footer>
      <SpeechButton :text="text" :language="targetLanguage" label="朗读译文" />
      <button type="button" @click="emit('copy-source')">复制原文</button>
      <button type="button" @click="emit('copy-bilingual')">复制双语</button>
      <button type="button" title="复制译文" @click="emit('copy')"><AppIcon :name="copied ? 'check' : 'copy'" :size="15" /> {{ copied ? '已复制' : '复制译文' }}</button>
      <button type="button" title="重新翻译" @click="emit('retry')">重新翻译</button>
    </footer>
  </section>
</template>

<style scoped>
.simple-translation { flex: 0 0 auto; min-height: 0; padding: 8px 2px 12px; }
.simple-target { min-height: 72px; padding: 8px 0 14px; }
.simple-target :deep(.segment-text) { padding: 0; font-size: 16px; font-weight: 600; line-height: 1.7; }
.simple-target p { margin: 0; font-size: 16px; line-height: 1.7; font-weight: 600; }
footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 6px; }
footer > button {
  min-height: 30px; display: inline-flex; align-items: center; gap: 5px;
  border: 0; border-radius: 6px; padding: 0 10px; color: var(--ink-soft); background: transparent; font-size: 13px; cursor: pointer;
}
footer > button:hover { background: var(--surface-soft); color: var(--ink); }
</style>
