<script setup lang="ts">
import { onMounted, ref } from "vue";
import AppIcon from "../../../components/AppIcon.vue";
import BrandLogo from "../../../components/BrandLogo.vue";
import { getTranslatorApi } from "../../../platform/translator";
import WorkbenchModeSwitch from "./WorkbenchModeSwitch.vue";

const props = defineProps<{ mode?: "normal" | "naming" }>();
const emit = defineEmits<{
  history: [];
  "update:mode": [mode: "normal" | "naming"];
}>();

const translator = getTranslatorApi();
const selectionEnabled = ref(true);
const notice = ref("");

onMounted(async () => {
  selectionEnabled.value = (await translator.settings.get()).shortcuts.enableSelectionTranslation;
});

async function toggleSelection(): Promise<void> {
  const previous = selectionEnabled.value;
  const next = !previous;
  selectionEnabled.value = next;
  try {
    const response = await translator.settings.patch({ type: "update-shortcuts", value: { enableSelectionTranslation: next } });
    selectionEnabled.value = response.snapshot.settings.shortcuts.enableSelectionTranslation;
  } catch {
    selectionEnabled.value = previous;
    notice.value = "划词开关更新失败";
    window.setTimeout(() => { notice.value = ""; }, 2400);
  }
}

function requestOcr(): void {
  window.dispatchEvent(new CustomEvent("lexiflow:ocr"));
}

function changeMode(mode: "normal" | "naming"): void {
  emit("update:mode", mode);
}
</script>

<template>
  <header class="workbench-topbar">
    <div class="topbar-leading">
      <a class="brand" href="#/" aria-label="LexiFlow 首页"><BrandLogo /></a>
      <WorkbenchModeSwitch :mode="props.mode ?? 'normal'" @change="changeMode" />
    </div>
    <nav class="topbar-actions" aria-label="工作台工具">
      <button class="selection-toggle" type="button" :aria-pressed="selectionEnabled" @click="toggleSelection">
        <span>划词</span><i :class="{ on: selectionEnabled }" />
      </button>
      <button class="topbar-icon" type="button" title="OCR 截图" aria-label="OCR 截图" @click="requestOcr"><span class="capture-icon" /></button>
      <button class="topbar-icon" type="button" title="历史记录" aria-label="历史记录" @click="emit('history')"><AppIcon name="history" :size="17" /></button>
      <a class="topbar-icon" href="#/vocabulary" title="单词本" aria-label="单词本"><AppIcon name="book" :size="17" /></a>
      <a class="topbar-icon" href="#/documents" title="文档翻译" aria-label="文档翻译"><AppIcon name="document" :size="17" /></a>
      <a class="topbar-icon" href="#/settings" title="设置" aria-label="设置"><AppIcon name="settings" :size="17" /></a>
    </nav>
    <p v-if="notice" class="topbar-notice" role="status">{{ notice }}</p>
  </header>
</template>

<style scoped>
.workbench-topbar {
  height: 42px; flex: 0 0 42px; display: flex; align-items: center; justify-content: space-between;
  padding: 0 156px 0 12px; border-bottom: 1px solid var(--border); background: var(--surface);
  -webkit-app-region: drag;
}
.topbar-leading, .topbar-actions, .brand, .mode-switch, button, a { -webkit-app-region: no-drag; }
.topbar-leading { display: flex; align-items: center; gap: 10px; min-width: 0; }
.brand { display: flex; align-items: center; border: 0; padding: 0; color: var(--ink); background: none; text-decoration: none; }
.topbar-actions { display: flex; align-items: center; gap: 3px; }
.topbar-icon, .selection-toggle {
  height: 28px; border: 0; border-radius: 6px; color: var(--ink-soft); background: transparent; cursor: pointer;
}
.topbar-icon { width: 30px; display: grid; place-items: center; text-decoration: none; }
.topbar-icon:hover, .selection-toggle:hover { color: var(--ink); background: var(--surface-soft); }
.selection-toggle { display: flex; align-items: center; gap: 6px; padding: 0 6px; font-size: 12px; }
.selection-toggle i { width: 24px; height: 14px; padding: 2px; border-radius: 99px; background: var(--border-strong); }
.selection-toggle i::after {
  display: block; width: 10px; height: 10px; border-radius: 50%; background: white;
  box-shadow: 0 1px 2px rgba(53,62,50,.2); content: ""; transition: transform .18s ease;
}
.selection-toggle i.on { background: var(--accent); }
.selection-toggle i.on::after { transform: translateX(10px); }
.capture-icon { width: 15px; height: 15px; border: 1.5px dashed currentColor; border-radius: 2px; }
.topbar-notice {
  position: absolute; left: 50%; bottom: -28px; transform: translateX(-50%);
  margin: 0; padding: 4px 10px; border-radius: 999px; color: var(--ink-soft);
  background: var(--surface); box-shadow: var(--shadow-float); font-size: 12px; -webkit-app-region: no-drag;
}
</style>
