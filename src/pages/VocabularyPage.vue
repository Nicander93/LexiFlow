<script setup lang="ts">
import { ref } from "vue";
import UiSelect from "../components/UiSelect.vue";
import VocabularyCard from "../features/vocabulary/components/VocabularyCard.vue";
import { useVocabularyBook } from "../features/vocabulary/useVocabularyBook";
import type { VocabularyUpsertInput } from "../../electron/shared/types";

const book = useVocabularyBook();
const filterOptions = [
  { value: "learning", label: "学习中" },
  { value: "mastered", label: "已掌握" },
  { value: "all", label: "全部单词" }
];

const pending = ref(new Set<string>());

async function update(id: string, action: () => Promise<unknown>): Promise<void> {
  if (pending.value.has(id)) return;
  pending.value.add(id);
  try { await action(); }
  finally { pending.value.delete(id); }
}

function save(input: VocabularyUpsertInput): void {
  if (input.id) void update(input.id, () => book.upsert(input));
}
</script>

<template>
  <div class="page vocabulary-page">
    <section class="vocabulary-heading">
      <h1>单词本</h1>
      <span>{{ book.entries.value.filter((entry) => entry.status === 'learning').length }} 个生词待学习</span>
    </section>
    <section v-if="book.entries.value.length" class="vocabulary-tools surface">
      <input v-model="book.query.value" type="search" placeholder="搜索单词、释义或笔记" aria-label="搜索单词本" />
      <UiSelect v-model="book.status.value" :options="filterOptions" label="筛选学习状态" />
    </section>
    <Transition name="panel"><p v-if="book.notice.value" class="success-text" role="status">{{ book.notice.value }}</p></Transition>
    <Transition name="panel"><div v-if="book.error.value" class="error-card" role="alert">{{ book.error.value }}</div></Transition>
    <div v-if="book.loading.value" class="loading-card"><span class="spinner" />正在读取单词本</div>
    <section v-else-if="book.filteredEntries.value.length" class="vocabulary-list">
      <VocabularyCard v-for="entry in book.filteredEntries.value" :key="entry.id" :entry="entry" :busy="pending.has(entry.id)" @save="save" @delete="update($event, () => book.remove($event))" />
    </section>
    <section v-else class="vocabulary-empty surface">
      <strong>{{ book.entries.value.length ? "没有符合筛选条件的单词" : "单词本还是空的" }}</strong>
      <template v-if="book.entries.value.length">
        <button class="text-button" type="button" @click="book.query.value = ''; book.status.value = 'all'">清除筛选</button>
      </template>
      <template v-else-if="!book.error.value">
        <p>在词典结果中点击星标，即可保存单词。</p>
        <a href="#/">返回翻译工作台</a>
      </template>
      <button v-else class="text-button" type="button" @click="book.load">重新读取单词本</button>
    </section>
  </div>
</template>

<style scoped>
.vocabulary-page { width: min(880px, 100%); margin: 0 auto; display: grid; gap: 14px; padding: 24px; }
.vocabulary-heading { display: flex; align-items: end; justify-content: space-between; gap: 20px; }
.vocabulary-heading h1 { margin: 0; font-size: 24px; }
.vocabulary-heading p { margin: 6px 0 0; color: var(--muted); }
.vocabulary-heading > span { color: var(--accent-strong); font-size: 13px; }
.vocabulary-tools { display: grid; grid-template-columns: 1fr 160px; gap: 10px; padding: 10px; }
.vocabulary-list { display: grid; gap: 10px; }
.vocabulary-empty { display: grid; place-items: center; gap: 8px; min-height: 220px; color: var(--muted); text-align: center; }
.vocabulary-empty strong { color: var(--ink); font-size: 17px; }
.vocabulary-empty p { margin: 0; }
.vocabulary-empty a { color: var(--accent-strong); }
@media (max-width: 680px) { .vocabulary-page { padding: 16px; } .vocabulary-tools { grid-template-columns: 1fr; } }
</style>
