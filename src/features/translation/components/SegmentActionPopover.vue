<script setup lang="ts">
import type { SegmentAlternative, SegmentRevision, TranslationSegment } from "../../../../electron/shared/types";

defineProps<{
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

const instructions = ["更自然", "更正式", "更简洁", "更口语", "更直译", "保持原句结构"];
</script>

<template>
  <section v-if="lockedSegment" class="revision-popover surface">
    <div class="panel-toolbar">
      <span>局部重译</span>
      <div>
        <button class="text-button" :disabled="alternativesLoading" @click="emit('request-alternatives')">{{ alternativesLoading ? '生成候选中' : '候选译法' }}</button>
        <button class="text-button" @click="emit('add-to-glossary')">加入术语表</button>
        <button class="text-button" :disabled="!revisions.some((item) => item.segmentId === lockedSegment?.id)" @click="emit('undo')">撤销本句修改</button>
        <button class="text-button" @click="emit('close')">关闭</button>
      </div>
    </div>
    <p>仅向模型发送当前句段。选择一种调整方式：</p>
    <div class="revision-actions"><button v-for="instruction in instructions" :key="instruction" class="secondary-button" :disabled="revisionStatus === 'loading'" @click="emit('revise', instruction)">{{ instruction }}</button></div>
    <div class="revision-custom"><input :value="customInstruction" :disabled="revisionStatus === 'loading'" placeholder="自定义要求，或指定词语，例如：使用“接口”表达" @input="emit('update:custom-instruction', ($event.target as HTMLInputElement).value)" @keydown.enter.prevent="emit('revise-custom')" /><button class="secondary-button" :disabled="revisionStatus === 'loading'" @click="emit('revise-custom')">按要求重译</button></div>
    <div v-if="alternatives.length" class="alternative-list"><button v-for="alternative in alternatives" :key="alternative.id" @click="emit('apply-alternative', alternative)"><strong>{{ alternative.label }}</strong><span>{{ alternative.target }}</span><small>{{ alternative.description }}</small></button></div>
    <small v-if="revisionStatus === 'loading'" class="muted">正在重新表达当前句段…</small><small v-else-if="revisionError" class="error-text">{{ revisionError }}</small><small v-else-if="revisionNotice" class="muted">{{ revisionNotice }}</small>
  </section>
</template>
