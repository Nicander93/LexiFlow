<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getTranslatorApi } from "./platform/translator";
import WorkbenchTopbar from "./features/workbench/components/WorkbenchTopbar.vue";
import HistoryDrawer from "./features/history/components/HistoryDrawer.vue";
import BrandLogo from "./components/BrandLogo.vue";
import { useWorkbenchUi } from "./features/workbench/useWorkbenchUi";

const route = useRoute();
const router = useRouter();
const translator = getTranslatorApi();
const shell = computed(() => (route.meta.shell as string | undefined) ?? (route.meta.popup ? "popup" : "workbench"));
const { historyOpen, workbenchMode, openHistory, closeHistory, setMode, restoreHistory, restoredHistory } = useWorkbenchUi();
const content = ref<HTMLElement>();
const preserveWorkbench = ref(true);
watch(() => route.path, () => {
  closeHistory();
  if (content.value) content.value.scrollTop = 0;
});
const secondaryTitle = computed(() => {
  if (route.path.startsWith("/settings")) return "设置";
  if (route.path.startsWith("/documents")) return "文档翻译";
  if (route.path.startsWith("/vocabulary")) return "单词本";
  if (route.path.startsWith("/about")) return "关于";
  return "页面未找到";
});

let removeNavigateListener: (() => void) | undefined;
let removeCaptureListener: (() => void) | undefined;
onMounted(() => {
  removeNavigateListener = translator.window.onNavigate(async ({ route: path, draft }) => {
    await router.push(path);
    if (!draft || route.path !== "/") return;
    setMode(route.query.mode === "naming" ? "naming" : "normal");
    await nextTick();
    window.dispatchEvent(new CustomEvent("lexiflow:open-draft", { detail: draft }));
  });
  removeCaptureListener = translator.ocr.onCaptureRequested(async () => {
    if (route.path !== "/") await router.push("/");
    await nextTick();
    window.dispatchEvent(new CustomEvent("lexiflow:ocr"));
  });
  window.addEventListener("lexiflow:local-data-cleared", resetWorkbenchCache);
});
onUnmounted(() => {
  removeNavigateListener?.();
  removeCaptureListener?.();
  window.removeEventListener("lexiflow:local-data-cleared", resetWorkbenchCache);
});

async function resetWorkbenchCache(): Promise<void> {
  preserveWorkbench.value = false;
  restoredHistory.value = undefined;
  setMode("normal");
  await nextTick();
  preserveWorkbench.value = true;
}

async function focusContent(): Promise<void> {
  await nextTick();
  if (document.activeElement === document.body) content.value?.focus({ preventScroll: true });
}
</script>

<template>
  <router-view v-if="shell === 'popup'" />
  <div v-else class="app-frame">
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <WorkbenchTopbar
      v-if="shell === 'workbench'"
      :mode="workbenchMode"
      :history-open="historyOpen"
      @update:mode="setMode"
      @history="historyOpen ? closeHistory() : openHistory()"
    />
    <header v-else class="secondary-topbar">
      <button class="back-button" type="button" @click="setMode('normal'); router.push('/')">← 返回翻译</button>
      <span class="secondary-title"><BrandLogo compact /> {{ secondaryTitle }}</span>
    </header>
    <main id="main-content" ref="content" class="app-content" tabindex="-1" :inert="historyOpen">
      <router-view v-slot="{ Component }">
        <Transition name="page" @leave="(_, done) => done()" @enter="focusContent">
          <KeepAlive :include="preserveWorkbench ? 'TranslationPage' : []">
            <component :is="Component" :key="route.path" />
          </KeepAlive>
        </Transition>
      </router-view>
    </main>
    <HistoryDrawer
      v-if="shell === 'workbench'"
      :open="historyOpen"
      @close="closeHistory"
      @restore="restoreHistory"
    />
  </div>
</template>

<style scoped>
.app-frame { height: 100dvh; display: flex; flex-direction: column; overflow: hidden; background: var(--app-bg); }
.app-content { flex: 1; min-height: 0; overflow: auto; scrollbar-width: thin; }
.secondary-topbar {
  height: 42px; flex: 0 0 42px; display: flex; align-items: center; gap: 12px;
  padding: 0 156px 0 12px; border-bottom: 1px solid var(--border); background: var(--surface);
  -webkit-app-region: drag;
}
.back-button, .secondary-title { -webkit-app-region: no-drag; }
.back-button {
  min-height: 28px; border: 0; border-radius: 6px; padding: 0 10px;
  color: var(--accent-strong); background: var(--accent-soft); font-size: 13px; cursor: pointer;
}
.back-button:hover { background: var(--surface-active); }
.secondary-title { display: inline-flex; align-items: center; gap: 8px; color: var(--ink-soft); font-size: 13px; }
.back-button { flex-shrink: 0; }
@media (max-width: 600px) {
  .secondary-title :deep(.brand-logo) { display: none; }
}
@media (max-width: 460px) {
  .secondary-topbar { padding-right: 12px; }
}
</style>
