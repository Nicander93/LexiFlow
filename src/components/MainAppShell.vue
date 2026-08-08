<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import WorkbenchTopbar from "../features/workbench/components/WorkbenchTopbar.vue";
import HistoryDrawer from "../features/history/components/HistoryDrawer.vue";

const router = useRouter();
const route = useRoute();
const historyOpen = ref(route.query.drawer === "history");
watch(() => route.query.drawer, (value) => { historyOpen.value = value === "history"; });
</script>

<template>
  <div class="main-app-shell">
    <div class="window-chrome" aria-hidden="true" />
    <WorkbenchTopbar
      @history="historyOpen = true"
      @documents="router.push('/documents')"
      @settings="router.push('/settings')"
      @about="router.push('/about')"
    />
    <main id="main-content" class="main-app-content"><slot /></main>
    <HistoryDrawer :open="historyOpen" @close="historyOpen = false" @restore="historyOpen = false" />
  </div>
</template>

<style scoped>
.main-app-shell { height: 100dvh; display: flex; flex-direction: column; overflow: hidden; background: var(--app-bg); }
.window-chrome { height: 28px; flex: 0 0 28px; background: var(--surface); -webkit-app-region: drag; }
.main-app-content { flex: 1; min-height: 0; overflow: auto; scrollbar-width: none; }
.main-app-content::-webkit-scrollbar { width: 0; height: 0; }
</style>
