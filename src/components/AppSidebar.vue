<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppIcon from "./AppIcon.vue";
import logoUrl from "../assets/logo.png";
import { getTranslatorApi } from "../platform/translator";
import type { AppSettings } from "../../electron/shared/types";

const router = useRouter();
const translator = getTranslatorApi();
const settings = ref<AppSettings>();
const savingSelection = ref(false);

const navigation = [
  { to: "/", label: "翻译", icon: "translate" as const },
  { to: "/naming", label: "命名", icon: "sparkle" as const },
  { to: "/history", label: "历史", icon: "history" as const },
  { to: "/documents", label: "文档", icon: "history" as const }
];

async function captureOcr(): Promise<void> {
  await router.push("/");
  window.setTimeout(() => window.dispatchEvent(new CustomEvent("lexiflow:ocr-capture")), 0);
}

async function toggleSelection(): Promise<void> {
  if (!settings.value || savingSelection.value) return;
  const previous = settings.value.shortcuts.enableSelectionTranslation;
  settings.value.shortcuts.enableSelectionTranslation = !previous;
  savingSelection.value = true;
  try {
    const result = await translator.settings.update(settings.value);
    settings.value = result.settings;
    window.dispatchEvent(new CustomEvent("lexiflow:settings-updated", { detail: result.settings }));
  } catch {
    settings.value.shortcuts.enableSelectionTranslation = previous;
  } finally {
    savingSelection.value = false;
  }
}

function handleSettingsUpdated(event: Event): void {
  settings.value = (event as CustomEvent<AppSettings>).detail;
}

onMounted(async () => {
  window.addEventListener("lexiflow:settings-updated", handleSettingsUpdated);
  settings.value = await translator.settings.get().catch(() => undefined);
});
onUnmounted(() => window.removeEventListener("lexiflow:settings-updated", handleSettingsUpdated));
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <img class="brand-mark" :src="logoUrl" alt="" width="28" height="28" />
      <strong>LexiFlow</strong>
    </div>
    <nav aria-label="主导航">
      <RouterLink v-for="item in navigation" :key="item.to" :to="item.to" :title="item.label" :aria-label="item.label">
        <span class="nav-icon"><AppIcon :name="item.icon" :size="16" /></span>
        <span class="nav-label">{{ item.label }}</span>
      </RouterLink>
    </nav>
    <div class="sidebar-divider" />
    <div class="sidebar-tools" aria-label="快速工具">
      <button type="button" title="截图 OCR" aria-label="截图 OCR" @click="captureOcr">
        <span class="nav-icon"><AppIcon name="search" :size="16" /></span>
        <span class="nav-label">截图 OCR</span>
      </button>
      <button
        type="button"
        title="划词翻译"
        aria-label="切换划词翻译"
        :aria-pressed="settings?.shortcuts.enableSelectionTranslation"
        :disabled="!settings || savingSelection"
        @click="toggleSelection"
      >
        <span class="nav-icon"><AppIcon name="translate" :size="16" /></span>
        <span class="nav-label">划词翻译</span>
        <span class="sidebar-mini-switch" :class="{ active: settings?.shortcuts.enableSelectionTranslation }" aria-hidden="true" />
      </button>
    </div>
    <div class="sidebar-bottom">
      <RouterLink to="/settings" title="设置" aria-label="设置"><span class="nav-icon"><AppIcon name="settings" :size="16" /></span><span class="nav-label">设置</span></RouterLink>
      <RouterLink to="/about" title="关于" aria-label="关于"><span class="nav-icon"><AppIcon name="info" :size="16" /></span><span class="nav-label">关于</span></RouterLink>
      <span class="local-status" title="文本由当前选择的模型服务处理"><i />本地优先</span>
    </div>
  </aside>
</template>