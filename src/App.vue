<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
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
const { historyOpen, workbenchMode, openHistory, closeHistory, setMode } = useWorkbenchUi();
const secondaryTitle = computed(() => {
  if (route.path.startsWith("/settings")) return "LexiFlow · 设置";
  if (route.path.startsWith("/documents")) return "LexiFlow · 文档翻译";
  if (route.path.startsWith("/vocabulary")) return "LexiFlow · 单词本";
  if (route.path.startsWith("/about")) return "LexiFlow · 关于";
  return "LexiFlow";
});

let removeNavigateListener: (() => void) | undefined;
onMounted(() => {
  removeNavigateListener = translator.window.onNavigate((path) => void router.push(path));
});
onUnmounted(() => removeNavigateListener?.());
</script>

<template>
  <router-view v-if="shell === 'popup'" />
  <div v-else class="app-frame">
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <WorkbenchTopbar
      v-if="shell === 'workbench'"
      :mode="workbenchMode"
      @update:mode="setMode"
      @history="openHistory"
    />
    <header v-else class="secondary-topbar">
      <button class="back-button" type="button" @click="router.push('/')">← 返回翻译</button>
      <span class="secondary-title"><BrandLogo compact /> {{ secondaryTitle }}</span>
    </header>
    <main id="main-content" class="app-content">
      <router-view v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" :key="route.path" />
        </Transition>
      </router-view>
    </main>
    <HistoryDrawer
      v-if="shell === 'workbench'"
      :open="historyOpen"
      @close="closeHistory"
      @restore="closeHistory"
    />
  </div>
</template>

<style scoped>
.app-frame { height: 100dvh; display: flex; flex-direction: column; overflow: hidden; background: var(--app-bg); }
.app-content { flex: 1; min-height: 0; overflow: auto; scrollbar-width: none; }
.app-content::-webkit-scrollbar { width: 0; height: 0; }
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
</style>
