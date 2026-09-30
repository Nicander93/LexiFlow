<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { shouldLookupDictionary } from "../../../../electron/shared/dictionary-eligibility";

const props = withDefaults(defineProps<{ root?: HTMLElement; maxLength?: number }>(), { maxLength: 10_000 });
const emit = defineEmits<{ translate: [text: string]; dictionary: [text: string, segmentId?: string] }>();
const selectedText = ref("");
const segmentId = ref<string>();
const position = ref({ top: "0px", left: "0px" });
const toolbar = ref<HTMLElement>();
const dictionaryEligible = computed(() => shouldLookupDictionary(selectedText.value));

function clear(): void { selectedText.value = ""; segmentId.value = undefined; }

function captureSelection(event: MouseEvent | KeyboardEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !props.root?.contains(target)) return;
  const selectionElement = target.closest<HTMLElement>("[data-selection-text]");
  if (!selectionElement || !props.root.contains(selectionElement)) { clear(); return; }
  let text = "";
  let bounds: DOMRect;
  if (selectionElement instanceof HTMLTextAreaElement) {
    text = selectionElement.value.slice(selectionElement.selectionStart, selectionElement.selectionEnd).trim();
    bounds = selectionElement.getBoundingClientRect();
  } else {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) { clear(); return; }
    const range = selection.getRangeAt(0);
    if (!selectionElement.contains(range.commonAncestorContainer)) { clear(); return; }
    text = selection.toString().trim();
    bounds = range.getBoundingClientRect();
  }
  if (!text) { clear(); return; }
  selectedText.value = text;
  segmentId.value = target.closest<HTMLElement>("[data-segment-id]")?.dataset.segmentId;
  position.value = {
    top: `${Math.max(8, Math.min(window.innerHeight - 48, bounds.bottom + 5))}px`,
    left: `${Math.max(8, Math.min(window.innerWidth - 264, bounds.left))}px`
  };
}

function handlePointerDown(event: MouseEvent): void {
  if (event.target instanceof Node && !toolbar.value?.contains(event.target)) clear();
}
function handleKeydown(event: KeyboardEvent): void { if (event.key === "Escape") clear(); }
function translate(): void { const text = selectedText.value; clear(); emit("translate", text); }
function lookup(): void { const text = selectedText.value; const id = segmentId.value; clear(); emit("dictionary", text, id); }
onMounted(() => {
  document.addEventListener("mouseup", captureSelection);
  document.addEventListener("keyup", captureSelection);
  document.addEventListener("mousedown", handlePointerDown);
  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("scroll", clear, true);
});
onUnmounted(() => {
  document.removeEventListener("mouseup", captureSelection);
  document.removeEventListener("keyup", captureSelection);
  document.removeEventListener("mousedown", handlePointerDown);
  document.removeEventListener("keydown", handleKeydown);
  document.removeEventListener("scroll", clear, true);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="selectedText" ref="toolbar" class="selection-toolbar" :style="position" role="toolbar" aria-label="选中文字操作">
      <button type="button" :disabled="selectedText.length > maxLength" :title="selectedText.length > maxLength ? `选中文字超过 ${maxLength} 字符` : '只翻译选中内容'" @mousedown.prevent @click="translate">翻译选中内容</button>
      <button v-if="dictionaryEligible" type="button" @mousedown.prevent @click="lookup">查词</button>
    </div>
  </Teleport>
</template>

<style scoped>
.selection-toolbar { position: fixed; z-index: 40; display: flex; gap: 3px; padding: 4px; max-width: calc(100vw - 16px); border: 1px solid var(--border); border-radius: 7px; background: var(--surface); box-shadow: var(--shadow-float); }
.selection-toolbar button { border: 0; border-radius: 4px; padding: 6px 10px; white-space: nowrap; color: var(--ink); background: var(--surface); cursor: pointer; font-size: 12px; }
.selection-toolbar button:hover:not(:disabled) { background: var(--accent-soft); }
</style>
