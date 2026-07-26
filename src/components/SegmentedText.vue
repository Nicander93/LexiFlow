<script setup lang="ts">
import { ref, type ComponentPublicInstance } from "vue";
import type { TranslationSegment } from "../../electron/shared/types";

const props = defineProps<{
  segments: TranslationSegment[];
  side: "source" | "target";
  activeId?: string;
}>();
const emit = defineEmits<{
  hover: [id: string | undefined];
  toggle: [id: string];
  clear: [];
  navigate: [id: string];
  selectTerm: [term: string, segmentId: string];
}>();

const segmentElements = ref<HTMLElement[]>([]);

function setSegmentElement(index: number, element: Element | ComponentPublicInstance | null): void {
  if (element instanceof HTMLElement) segmentElements.value[index] = element;
}

function move(index: number, offset: number): void {
  const nextIndex = Math.max(0, Math.min(props.segments.length - 1, index + offset));
  const segment = props.segments[nextIndex];
  if (!segment) return;
  segmentElements.value[nextIndex]?.focus();
  emit("navigate", segment.id);
}

function reportSelection(segmentId: string): void {
  const term = window.getSelection()?.toString().trim();
  if (term && term.length <= 80) emit("selectTerm", term, segmentId);
}
</script>

<template>
  <div class="segment-text" :class="`segment-text--${side}`" @click.self="emit('clear')" @mouseleave="emit('hover', undefined)">
    <span
      v-for="(segment, index) in segments"
      :key="segment.id"
      :ref="(element) => setSegmentElement(index, element)"
      class="translation-segment"
      :class="{ active: activeId === segment.id }"
      role="button"
      tabindex="0"
      @mouseenter="emit('hover', segment.id)"
      @focus="emit('hover', segment.id)"
      @click.stop="emit('toggle', segment.id)"
      @mouseup="reportSelection(segment.id)"
      @keydown.left.stop.prevent="move(index, -1)"
      @keydown.right.stop.prevent="move(index, 1)"
    >{{ side === 'source' ? segment.source : segment.target }}</span>
  </div>
</template>
