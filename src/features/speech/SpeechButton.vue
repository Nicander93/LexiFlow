<script setup lang="ts">
import { computed } from "vue";
import AppIcon from "../../components/AppIcon.vue";
import { useSpeech } from "./useSpeech";

const props = withDefaults(defineProps<{
  text: string;
  language?: string;
  label?: string;
  iconOnly?: boolean;
}>(), { language: "en-US", label: "朗读", iconOnly: false });

const speech = useSpeech();
const available = computed(() => {
  void speech.snapshot.value.status;
  return Boolean(props.text.trim()) && speech.canSpeak(props.language);
});
const title = computed(() => speech.error.value || (available.value
  ? (speech.isSpeaking.value ? "停止朗读" : props.label)
  : "当前系统未安装匹配的语音。"));
</script>

<template>
  <button
    type="button"
    :class="iconOnly ? 'icon-button' : 'speech-button'"
    :disabled="!available"
    :title="title"
    :aria-label="title"
    :aria-pressed="speech.isSpeaking.value"
    @click="speech.toggle(text, language)"
  >
    <AppIcon :name="speech.isSpeaking.value ? 'stop' : 'speaker'" :size="15" />
    <span v-if="!iconOnly">{{ speech.isSpeaking.value ? "停止" : label }}</span>
  </button>
</template>

<style scoped>
.speech-button {
  min-height: 30px; display: inline-flex; align-items: center; gap: 5px;
  border: 0; border-radius: 6px; padding: 0 10px; color: var(--ink-soft);
  background: transparent; font-size: 13px; cursor: pointer;
}
.speech-button:hover:not(:disabled) { color: var(--ink); background: var(--surface-soft); }
.speech-button:disabled { opacity: .48; cursor: not-allowed; }
</style>
