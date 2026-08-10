import { onUnmounted, ref } from "vue";
import type { DictionaryLookupResult } from "../../../electron/shared/types";
import { shouldLookupDictionary } from "../../../electron/shared/dictionary-eligibility";
import { getTranslatorApi } from "../../platform/translator";

export type DictionaryUiStatus = "idle" | "loading" | "found" | "not-found" | "unavailable" | "error";

export function useDictionary(debounceMs = 220) {
  const translator = getTranslatorApi();
  const status = ref<DictionaryUiStatus>("idle");
  const result = ref<DictionaryLookupResult | null>(null);
  const currentQuery = ref("");
  let lookupSequence = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  function clearState(): void {
    status.value = "idle";
    result.value = null;
    currentQuery.value = "";
  }

  async function lookupNow(query: string): Promise<void> {
    const sequence = ++lookupSequence;
    currentQuery.value = query;
    if (!query.trim() || !shouldLookupDictionary(query)) {
      clearState();
      return;
    }

    status.value = "loading";
    try {
      const next = await translator.dictionary.lookup({ query });
      if (disposed || sequence !== lookupSequence) return;
      result.value = next;
      if (next.unavailableReason) status.value = "unavailable";
      else if (next.found) status.value = "found";
      else status.value = "not-found";
    } catch {
      if (disposed || sequence !== lookupSequence) return;
      status.value = "error";
      result.value = {
        query,
        normalizedQuery: query.trim(),
        found: false,
        matchType: "none",
        suggestions: [],
        unavailableReason: "词典查询失败，请按文本翻译或重新启动应用。"
      };
    }
  }

  function lookup(query: string): void {
    if (timer) clearTimeout(timer);
    if (!query.trim()) {
      lookupSequence += 1;
      clearState();
      return;
    }
    timer = setTimeout(() => {
      void lookupNow(query);
    }, debounceMs);
  }

  function lookupImmediate(query: string): Promise<void> {
    if (timer) clearTimeout(timer);
    return lookupNow(query);
  }

  function reset(): void {
    if (timer) clearTimeout(timer);
    lookupSequence += 1;
    clearState();
  }

  onUnmounted(() => {
    disposed = true;
    if (timer) clearTimeout(timer);
    lookupSequence += 1;
  });

  return { status, result, currentQuery, lookup, lookupImmediate, reset };
}
