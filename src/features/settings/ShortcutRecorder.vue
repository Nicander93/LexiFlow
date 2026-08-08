<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import {
  findShortcutConflict,
  formatShortcutForDisplay,
  isValidShortcut,
  parseKeyboardEvent
} from "../../../electron/shared/shortcut";
import type { ShortcutSettings } from "../../../electron/shared/types";

const props = defineProps<{
  modelValue: string;
  shortcutKey: "translation" | "naming" | "screenshot";
  shortcuts: ShortcutSettings;
  label: string;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: string];
  commit: [value: string];
  error: [message: string];
}>();

const recording = ref(false);
const root = ref<HTMLButtonElement>();
const previous = ref("");

function begin(): void {
  previous.value = props.modelValue;
  recording.value = true;
}

function cancel(): void {
  recording.value = false;
}

function commit(value: string): void {
  const next = { ...props.shortcuts, [props.shortcutKey]: value };
  const conflict = findShortcutConflict(next);
  if (conflict || !isValidShortcut(value)) {
    emit("error", conflict ?? "请使用功能键，或至少包含一个修饰键。");
    emit("update:modelValue", previous.value);
    recording.value = false;
    return;
  }
  emit("update:modelValue", value);
  emit("commit", value);
  recording.value = false;
}

function onKeydown(event: KeyboardEvent): void {
  if (!recording.value || event.key === "Tab") return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "Escape") {
    cancel();
    return;
  }
  if (event.key === "Backspace" || event.key === "Delete") {
    commit("");
    return;
  }
  const shortcut = parseKeyboardEvent(event);
  if (shortcut) commit(shortcut);
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (recording.value && root.value && !root.value.contains(event.target as Node)) cancel();
}

onMounted(() => document.addEventListener("pointerdown", onDocumentPointerDown));
onUnmounted(() => document.removeEventListener("pointerdown", onDocumentPointerDown));
</script>

<template>
  <button
    ref="root"
    type="button"
    class="shortcut-recorder"
    :class="{ recording }"
    :aria-label="label"
    :aria-pressed="recording"
    @click="begin"
    @keydown="onKeydown"
  >
    <span>{{ recording ? "请按下快捷键" : (formatShortcutForDisplay(modelValue) || "未设置") }}</span>
    <small>{{ recording ? "Esc 取消 · Delete 清空" : "点击录制" }}</small>
  </button>
</template>