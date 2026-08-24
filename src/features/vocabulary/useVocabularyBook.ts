import { computed, onMounted, ref } from "vue";
import type { DictionaryEntry, VocabularyEntry, VocabularyStatus, VocabularyUpsertInput } from "../../../electron/shared/types";
import { getTranslatorApi } from "../../platform/translator";
import { dictionaryEntryToVocabulary } from "./vocabulary-entry";

export function useVocabularyBook(autoLoad = true) {
  const translator = getTranslatorApi();
  const entries = ref<VocabularyEntry[]>([]);
  const loading = ref(false);
  const error = ref("");
  const notice = ref("");
  const query = ref("");
  const status = ref<"all" | VocabularyStatus>("learning");

  const filteredEntries = computed(() => {
    const normalized = query.value.trim().toLocaleLowerCase();
    return entries.value.filter((entry) => {
      if (status.value !== "all" && entry.status !== status.value) return false;
      return !normalized || entry.term.toLocaleLowerCase().includes(normalized)
        || entry.translation.toLocaleLowerCase().includes(normalized)
        || entry.note?.toLocaleLowerCase().includes(normalized);
    });
  });

  async function load(): Promise<void> {
    loading.value = true;
    error.value = "";
    try {
      entries.value = await translator.vocabulary.list();
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "无法读取单词本。";
    } finally {
      loading.value = false;
    }
  }

  async function upsert(input: VocabularyUpsertInput): Promise<VocabularyEntry | undefined> {
    error.value = "";
    notice.value = "";
    try {
      const saved = await translator.vocabulary.upsert(input);
      const index = entries.value.findIndex((entry) => entry.id === saved.id);
      if (index >= 0) entries.value[index] = saved; else entries.value.unshift(saved);
      notice.value = `已保存“${saved.term}”。`;
      return saved;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "生词保存失败。";
      return undefined;
    }
  }

  async function saveDictionaryEntry(entry: DictionaryEntry, context?: string): Promise<VocabularyEntry | undefined> {
    return upsert(dictionaryEntryToVocabulary(entry, context));
  }

  async function remove(id: string): Promise<void> {
    await translator.vocabulary.delete(id);
    entries.value = entries.value.filter((entry) => entry.id !== id);
  }

  async function clear(): Promise<void> {
    await translator.vocabulary.clear();
    entries.value = [];
  }

  if (autoLoad) onMounted(() => { void load(); });

  return { entries, filteredEntries, loading, error, notice, query, status, load, upsert, saveDictionaryEntry, remove, clear };
}
