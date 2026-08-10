import { ref } from "vue";

const historyOpen = ref(false);
const workbenchMode = ref<"normal" | "naming">("normal");

export function useWorkbenchUi() {
  function openHistory(): void { historyOpen.value = true; }
  function closeHistory(): void { historyOpen.value = false; }
  function setMode(mode: "normal" | "naming"): void { workbenchMode.value = mode; }

  return {
    historyOpen,
    workbenchMode,
    openHistory,
    closeHistory,
    setMode
  };
}
