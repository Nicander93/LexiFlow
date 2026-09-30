import { ref } from "vue";
import type { TranslationHistory } from "../../../electron/shared/types";

const historyOpen = ref(false);
const workbenchMode = ref<"normal" | "naming">("normal");
const restoredHistory = ref<TranslationHistory>();

export function useWorkbenchUi() {
  function openHistory(): void { historyOpen.value = true; }
  function closeHistory(): void { historyOpen.value = false; }
  function setMode(mode: "normal" | "naming"): void { workbenchMode.value = mode; }
  function restoreHistory(item: TranslationHistory): void {
    restoredHistory.value = { ...item };
    closeHistory();
  }

  return {
    historyOpen,
    workbenchMode,
    openHistory,
    closeHistory,
    setMode, restoredHistory, restoreHistory
  };
}
