<script setup lang="ts">
import { computed, ref } from "vue";
import type { SegmentAlternative, SegmentRevision, TranslationSegment } from "../../../../electron/shared/types";

const props = defineProps<{
  lockedSegment?: TranslationSegment;
  revisions: SegmentRevision[];
  alternativesLoading: boolean;
  revisionStatus: "idle" | "loading" | "error";
  revisionError: string;
  revisionNotice: string;
  customInstruction: string;
  alternatives: SegmentAlternative[];
}>();

const emit = defineEmits<{
  (event: "request-alternatives"): void;
  (event: "add-to-glossary"): void;
  (event: "undo"): void;
  (event: "close"): void;
  (event: "revise", instruction: string): void;
  (event: "update:custom-instruction", value: string): void;
  (event: "revise-custom"): void;
  (event: "apply-alternative", value: SegmentAlternative): void;
}>();

const showCustom = ref(false);
const showMore = ref(false);
const primaryInstructions = ["更自然", "更简洁"];
const moreInstructions = ["更正式", "更口语", "更直译", "保持原句结构"];
const canUndo = computed(() => revisionsForActiveSegment());

function revisionsForActiveSegment(): boolean {
  const segmentId = props.lockedSegment?.id;
  return Boolean(segmentId && props.revisions.some((item) => item.segmentId === segmentId));
}
</script>

<template>
  <section v-if="lockedSegment" class="context-panel revision-popover surface">
    <div class="context-panel__header">
      <strong>调整这句话</strong>
      <button class="context-panel__close" type="button" title="关闭局部重译" aria-label="关闭局部重译" @click="emit('close')">×</button>
    </div>
    <p class="revision-source">{{ lockedSegment.source }}</p>
    <div class="revision-actions">
      <button class="primary-button" :disabled="revisionStatus === 'loading'" @click="emit('revise', '重新翻译，保持原意')">重译</button>
      <button v-for="instruction in primaryInstructions" :key="instruction" class="secondary-button" :disabled="revisionStatus === 'loading'" @click="emit('revise', instruction)">{{ instruction }}</button>
      <button class="secondary-button" type="button" :aria-expanded="showCustom" @click="showCustom = !showCustom">自定义…</button>
      <button class="text-button revision-more-trigger" type="button" :aria-expanded="showMore" @click="showMore = !showMore">更多</button>
    </div>
    <div v-if="showCustom" class="revision-custom"><input :value="customInstruction" :disabled="revisionStatus === 'loading'" autofocus placeholder="例如：使用“接口”表达" @input="emit('update:custom-instruction', ($event.target as HTMLInputElement).value)" @keydown.enter.prevent="emit('revise-custom')" /><button class="secondary-button" :disabled="revisionStatus === 'loading'" @click="emit('revise-custom')">应用</button></div>
    <div v-if="showMore" class="revision-secondary-actions">
      <button v-for="instruction in moreInstructions" :key="instruction" class="text-button" :disabled="revisionStatus === 'loading'" @click="emit('revise', instruction)">{{ instruction }}</button>
      <button class="text-button" :disabled="alternativesLoading" @click="emit('request-alternatives')">{{ alternativesLoading ? '生成候选中' : '候选译法' }}</button>
      <button class="text-button" @click="emit('add-to-glossary')">加入术语表</button>
      <button v-if="canUndo" class="text-button" @click="emit('undo')">撤销本句修改</button>
    </div>
    <div v-if="alternatives.length" class="alternative-list"><button v-for="alternative in alternatives" :key="alternative.id" @click="emit('apply-alternative', alternative)"><strong>{{ alternative.label }}</strong><span>{{ alternative.target }}</span><small>{{ alternative.description }}</small></button></div>
    <small v-if="revisionStatus === 'loading'" class="muted">正在重新表达当前句段…</small><small v-else-if="revisionError" class="error-text">{{ revisionError }}</small><small v-else-if="revisionNotice" class="muted">{{ revisionNotice }}</small>
  </section>
</template>
