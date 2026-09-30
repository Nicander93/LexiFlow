<script setup lang="ts">
import type { TranslationSegment } from "../../../../electron/shared/types";

withDefaults(defineProps<{
  segments: TranslationSegment[];
  side: "source" | "target";
  activeId?: string;
  adjustable?: boolean;
}>(), { adjustable: true });
const emit = defineEmits<{
  hover: [id: string | undefined];
  toggle: [id: string];
  clear: [];
  navigate: [id: string];
  selectTerm: [term: string, segmentId: string];
}>();
</script>

<template>
  <div class="segment-text" data-selection-text :class="`segment-text--${side}`" @mouseleave="emit('hover', undefined)">
    <template v-for="(segment, index) in segments" :key="segment.id">
      <span class="segment-group">
        <span class="translation-segment" :data-segment-id="segment.id" :class="{ active: activeId === segment.id }" @mouseenter="emit('hover', segment.id)">{{ side === 'source' ? segment.source : segment.target }}</span>
        <button
          v-if="side === 'target' && adjustable"
          class="segment-adjust" type="button" :aria-label="`调整第 ${index + 1} 句`" title="调整这句译文"
          @click="emit('toggle', segment.id)" @focus="emit('hover', segment.id)"
        >调整</button>
      </span><template v-if="index < segments.length - 1"><br v-if="segment.boundaryAfter === 'line'" /><span v-else-if="segment.boundaryAfter === 'paragraph' || segment.boundaryAfter === 'block'"><br /><br /></span><span v-else-if="side === 'source' || segment.boundaryAfter === 'sentence'"> </span></template>
    </template>
  </div>
</template>

<style scoped>
.segment-group { display: inline; }
.segment-adjust {
  display: inline-block; margin: 0 3px; padding: 1px 5px; border: 0; border-radius: 4px;
  color: var(--accent-strong); background: var(--accent-soft); font: inherit; font-size: 11px;
  vertical-align: middle; cursor: pointer; opacity: .65; user-select: none;
}
.segment-group:hover .segment-adjust, .segment-adjust:focus-visible { opacity: 1; }
</style>
