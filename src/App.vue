<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getTranslatorApi } from "./platform/translator";
import MainAppShell from "./components/MainAppShell.vue";

const route = useRoute();
const router = useRouter();
const translator = getTranslatorApi();
const isPopup = computed(() => route.meta.popup === true);
let removeNavigateListener: (() => void) | undefined;

onMounted(() => {
  removeNavigateListener = translator.window.onNavigate((path) => void router.push(path));
});
onUnmounted(() => removeNavigateListener?.());
</script>

<template>
  <a v-if="!isPopup" class="skip-link" href="#main-content">跳到主要内容</a>
  <router-view v-if="isPopup" />
  <MainAppShell v-else><router-view v-slot="{ Component }"><Transition name="page" mode="out-in"><component :is="Component" :key="route.fullPath" /></Transition></router-view></MainAppShell>
</template>
