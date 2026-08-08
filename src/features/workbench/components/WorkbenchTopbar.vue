<script setup lang="ts">
import { onMounted, ref } from "vue";
import AppIcon from "../../../components/AppIcon.vue";
import BrandLogo from "../../../components/BrandLogo.vue";
import { getTranslatorApi } from "../../../platform/translator";

const emit = defineEmits<{ history: []; documents: []; settings: []; about: [] }>();
const translator = getTranslatorApi();
const selectionEnabled = ref(true);
const moreOpen = ref(false);

onMounted(async () => { selectionEnabled.value = (await translator.settings.get()).shortcuts.enableSelectionTranslation; });
async function toggleSelection(): Promise<void> {
  const next = !selectionEnabled.value;
  const response = await translator.settings.patch({ type: "update-shortcuts", value: { enableSelectionTranslation: next } });
  selectionEnabled.value = response.snapshot.settings.shortcuts.enableSelectionTranslation;
}
function requestOcr(): void { window.dispatchEvent(new CustomEvent("lexiflow:ocr")); }
</script>

<template>
  <header class="workbench-topbar">
    <a class="brand" href="#/" aria-label="LexiFlow 首页"><BrandLogo /></a>
    <nav aria-label="工作台工具">
      <button class="selection-toggle" :aria-pressed="selectionEnabled" @click="toggleSelection"><span>划词</span><i :class="{ on: selectionEnabled }" /></button>
      <button class="topbar-icon" title="OCR 截图" aria-label="OCR 截图" @click="requestOcr"><span class="capture-icon" /></button>
      <a class="topbar-icon" href="#/history" title="历史记录" aria-label="历史记录"><AppIcon name="history" :size="17" /></a>
      <div class="more-wrap">
        <button class="topbar-icon more-dots" title="更多" aria-label="更多" @click="moreOpen = !moreOpen">•••</button>
        <div v-if="moreOpen" class="more-menu">
          <a href="#/naming" @click="moreOpen = false">代码命名</a>
          <button @click="emit('documents'); moreOpen = false">文档翻译</button>
          <button @click="emit('about'); moreOpen = false">关于 LexiFlow</button>
        </div>
      </div>
      <a class="topbar-icon" href="#/settings" title="设置" aria-label="设置"><AppIcon name="settings" :size="17" /></a>
    </nav>
  </header>
</template>

<style scoped>
.workbench-topbar { height: 46px; display: flex; align-items: center; justify-content: space-between; padding: 0 13px 0 15px; border-bottom: 1px solid var(--border); background: var(--surface); }
.brand { display: flex; align-items: center; border: 0; padding: 0; color: var(--ink); background: none; text-decoration: none; }
nav { display: flex; align-items: center; gap: 3px; }
.topbar-icon, .selection-toggle { height: 28px; border: 0; border-radius: 5px; color: var(--ink-soft); background: transparent; cursor: pointer; transition: background .18s ease, color .18s ease, transform .18s ease; }
.topbar-icon { width: 29px; display: grid; place-items: center; text-decoration: none; }
.topbar-icon:hover, .selection-toggle:hover { color: var(--ink); background: var(--surface-soft); }
.topbar-icon:active, .selection-toggle:active { transform: scale(.96); }
.selection-toggle { display: flex; align-items: center; gap: 5px; padding: 0 5px; font-size: 10px; }
.selection-toggle i { width: 22px; height: 13px; padding: 2px; border-radius: 99px; background: var(--border-strong); }
.selection-toggle i::after { display: block; width: 9px; height: 9px; border-radius: 50%; background: white; box-shadow: 0 1px 2px rgba(53,62,50,.2); content: ""; transition: transform .18s ease; }
.selection-toggle i.on { background: var(--accent); }.selection-toggle i.on::after { transform: translateX(9px); }
.capture-icon { width: 15px; height: 15px; border: 1.5px dashed currentColor; border-radius: 2px; }
.more-wrap { position: relative; }.more-dots { padding-bottom: 6px; letter-spacing: 1px; }
.more-menu { position: absolute; right: 0; top: 32px; z-index: 20; width: 142px; padding: 5px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface); box-shadow: var(--shadow-float); }
.more-menu button, .more-menu a { width: 100%; display: block; border: 0; border-radius: 4px; padding: 8px 9px; text-align: left; color: var(--ink-soft); background: none; font-size: 11px; text-decoration: none; }.more-menu button:hover, .more-menu a:hover { background: var(--surface-soft); color: var(--ink); }
</style>
