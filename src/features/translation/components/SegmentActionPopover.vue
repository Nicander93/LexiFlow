<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
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
  pendingRevision?: SegmentRevision;
  lastInstruction: string;
}>();

const emit = defineEmits<{
  (event: "request-alternatives"): void;
  (event: "undo"): void;
  (event: "close"): void;
  (event: "revise", instruction: string): void;
  (event: "update:custom-instruction", value: string): void;
  (event: "revise-custom"): void;
  (event: "apply-alternative", value: SegmentAlternative): void;
  (event: "apply-revision"): void;
  (event: "discard-suggestion"): void;
  (event: "save-history"): void;
}>();

const showCustom = ref(false);
const showMore = ref(false);
const primaryInstructions = ["更自然", "更简洁"];
const moreInstructions = ["更正式", "更口语", "更直译", "保持原句结构"];
const canUndo = computed(() => revisionsForActiveSegment());
const panel = ref<HTMLElement>();

function revealPanel(): void {
  void nextTick(() => panel.value?.scrollIntoView({ block: "nearest" }));
}
onMounted(revealPanel);
watch(() => props.pendingRevision, revealPanel);

function revisionsForActiveSegment(): boolean {
  const segmentId = props.lockedSegment?.id;
  return Boolean(segmentId && props.revisions.some((item) => item.segmentId === segmentId));
}
</script>

<template>
  <section v-if="lockedSegment" ref="panel" class="context-panel revision-popover surface">
    <div class="context-panel__header">
      <strong>调整这句话</strong>
      <button class="context-panel__close" type="button" title="关闭局部重译" aria-label="关闭局部重译" @click="emit('close')">×</button>
    </div>
    <p class="revision-source">{{ lockedSegment.source }}</p>
    <small>将调整以上整句。先对比，再替换；关闭面板会放弃未应用的建议。</small>
    <div class="revision-actions">
      <button class="primary-button" :disabled="revisionStatus === 'loading'" @click="emit('revise', '重新翻译，保持原意')">重译</button>
      <button v-for="instruction in primaryInstructions" :key="instruction" class="secondary-button" :disabled="revisionStatus === 'loading'" @click="emit('revise', instruction)">{{ instruction }}</button>
      <button class="secondary-button" type="button" :aria-expanded="showCustom" @click="showCustom = !showCustom">自定义…</button>
      <button class="text-button revision-more-trigger" type="button" :aria-expanded="showMore" @click="showMore = !showMore">更多</button>
      <button v-if="canUndo" class="text-button" :disabled="revisionStatus === 'loading'" @click="emit('undo')">撤销本句修改</button>
    </div>
    <div v-if="showCustom" class="revision-custom"><input :value="customInstruction" :disabled="revisionStatus === 'loading'" aria-label="调整要求" placeholder="例如：使用“接口”表达" @input="emit('update:custom-instruction', ($event.target as HTMLInputElement).value)" @keydown.enter.prevent="emit('revise-custom')" /><button class="secondary-button" :disabled="revisionStatus === 'loading'" @click="emit('revise-custom')">生成建议</button></div>
    <div v-if="showMore" class="revision-secondary-actions">
      <button v-for="instruction in moreInstructions" :key="instruction" class="text-button" :disabled="revisionStatus === 'loading'" @click="emit('revise', instruction)">{{ instruction }}</button>
      <button class="text-button" :disabled="alternativesLoading || revisionStatus === 'loading'" @click="emit('request-alternatives')">{{ alternativesLoading ? '生成候选中' : '候选译法' }}</button>
    </div>
    <div v-if="alternatives.length" class="alternative-list"><button v-for="alternative in alternatives" :key="alternative.id" @click="emit('apply-alternative', alternative)"><strong>{{ alternative.label }}</strong><span>{{ alternative.target }}</span><small>{{ alternative.description }}</small></button></div>
    <div v-if="pendingRevision" class="revision-comparison">
      <div><strong>当前译文</strong><p>{{ lockedSegment.target }}</p></div>
      <div class="revision-suggestion"><strong>建议译文 · {{ pendingRevision.instruction }}</strong><p>{{ pendingRevision.newTarget }}</p></div>
      <div class="revision-comparison-actions">
        <button class="primary-button" type="button" @click="emit('apply-revision')">替换这句</button>
        <button class="secondary-button" type="button" @click="emit('revise', lastInstruction)">重新生成</button>
        <button class="text-button" type="button" @click="emit('discard-suggestion')">放弃</button>
      </div>
    </div>
    <div aria-live="polite">
      <small v-if="revisionStatus === 'loading'" class="muted">正在生成建议，当前译文保持不变… <button class="text-button" type="button" @click="emit('discard-suggestion')">取消</button></small>
      <small v-else-if="revisionError" class="error-text">{{ revisionError }} <button v-if="revisionError.includes('历史保存失败')" class="text-button" type="button" @click="emit('save-history')">重试保存</button></small>
      <small v-else-if="revisionNotice" class="muted">{{ revisionNotice }}</small>
    </div>
  </section>
</template>

<style scoped>
.revision-comparison { margin: 12px 14px 0; display: grid; gap: 10px; }
.revision-comparison > div:not(.revision-comparison-actions) { padding: 12px; border: 1px solid var(--border); border-radius: 8px; }
.revision-comparison strong { font-size: 12px; color: var(--ink-soft); }
.revision-comparison p { margin: 7px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.65; }
.revision-suggestion { background: var(--accent-faint); }
.revision-comparison-actions { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
