<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import PageHeader from "../components/PageHeader.vue";
import AppIcon from "../components/AppIcon.vue";
import type { TranslationHistory } from "../../electron/shared/types";
import { getTranslatorApi } from "../platform/translator";

const items = ref<TranslationHistory[]>([]);
const keyword = ref("");
const selectedItem = ref<TranslationHistory>();
const translator = getTranslatorApi();
const loading = ref(true);
const showClearConfirm = ref(false);
const copied = ref(false);
const modeFilter = ref<"all" | TranslationHistory["mode"]>("all");
const favoritesOnly = ref(false);
const filteredItems = computed(() => {
  const value = keyword.value.trim().toLowerCase();
  return items.value.filter((item) =>
    (!value || item.sourceText.toLowerCase().includes(value) || item.resultText.toLowerCase().includes(value)) &&
    (modeFilter.value === "all" || item.mode === modeFilter.value) &&
    (!favoritesOnly.value || item.isFavorite)
  );
});

async function load(): Promise<void> {
  loading.value = true;
  try {
    items.value = await translator.history.list();
    if (!selectedItem.value && items.value.length) selectedItem.value = items.value[0];
  } finally {
    loading.value = false;
  }
}
async function deleteItem(id: string): Promise<void> {
  await translator.history.delete(id);
  if (selectedItem.value?.id === id) selectedItem.value = undefined;
  await load();
}
async function clearAll(): Promise<void> {
  await translator.history.clear();
  selectedItem.value = undefined;
  showClearConfirm.value = false;
  await load();
}
async function copy(text: string): Promise<void> {
  await translator.clipboard.writeText(text);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1200);
}
async function toggleFavorite(item: TranslationHistory): Promise<void> {
  const updated = await translator.history.toggleFavorite(item.id);
  if (!updated) return;
  const index = items.value.findIndex((candidate) => candidate.id === updated.id);
  if (index >= 0) items.value[index] = updated;
  if (selectedItem.value?.id === updated.id) selectedItem.value = updated;
}
function bilingualText(item: TranslationHistory): string {
  return `原文：${item.sourceText}\n\n译文：${item.resultText}`;
}
function retranslate(item: TranslationHistory): void {
  sessionStorage.setItem("lexiflow:retranslate", JSON.stringify(item));
  translator.window.openMain("/");
}
onMounted(load);
const modeLabel = (mode: TranslationHistory["mode"]) =>
  mode === "naming" ? "命名" : mode === "technical" ? "技术" : "翻译";
</script>

<template>
  <div class="page">
    <PageHeader title="历史">
      <button class="secondary-button danger" :disabled="!items.length" @click="showClearConfirm = true"><AppIcon name="trash" :size="15" /> 清空全部</button>
    </PageHeader>
    <div v-if="showClearConfirm" class="confirm-strip"><span>确定清空全部本地历史吗？此操作无法撤销。</span><div><button class="text-button" @click="showClearConfirm = false">取消</button><button class="secondary-button danger" @click="clearAll">确认清空</button></div></div>
    <div class="history-layout">
      <section class="history-list surface">
        <div class="search-wrap"><AppIcon name="search" :size="17" /><input v-model="keyword" class="search-input" placeholder="搜索原文或译文" /></div>
        <div class="history-filters"><button :class="{ active: modeFilter === 'all' }" @click="modeFilter = 'all'">全部</button><button :class="{ active: modeFilter === 'normal' }" @click="modeFilter = 'normal'">翻译</button><button :class="{ active: modeFilter === 'technical' }" @click="modeFilter = 'technical'">技术</button><button :class="{ active: modeFilter === 'naming' }" @click="modeFilter = 'naming'">命名</button><button :class="{ active: favoritesOnly }" @click="favoritesOnly = !favoritesOnly">收藏</button></div>
        <div v-if="loading" class="state-message muted"><span class="spinner" />正在读取本地记录</div>
        <div v-else-if="!filteredItems.length" class="state-message state-message--stack muted"><span class="empty-orb"><AppIcon name="history" /></span><strong>还没有匹配的记录</strong><small>完成一次翻译后，它会安静地留在这里</small></div>
        <div v-else class="history-items"><button v-for="item in filteredItems" :key="item.id" class="history-item" :class="{ active: selectedItem?.id === item.id }" @click="selectedItem = item">
          <span class="history-mode">{{ modeLabel(item.mode) }}<b v-if="item.isFavorite" title="已收藏"> ★</b></span><strong>{{ item.sourceText }}</strong><small>{{ new Date(item.createdAt).toLocaleString() }} · {{ item.model }}</small>
        </button></div>
      </section>
      <section class="history-detail surface">
        <template v-if="selectedItem">
          <div class="panel-toolbar"><span>详情</span><div><button class="text-button" :title="selectedItem.isFavorite ? '取消收藏' : '收藏'" @click="toggleFavorite(selectedItem)">{{ selectedItem.isFavorite ? '★ 已收藏' : '☆ 收藏' }}</button><button class="text-button danger" @click="deleteItem(selectedItem.id)">删除</button></div></div>
          <h3>原文</h3><pre>{{ selectedItem.sourceText }}</pre>
          <h3>结果</h3><pre>{{ selectedItem.resultText }}</pre>
          <div class="form-actions"><button class="secondary-button" title="复制原文" @click="copy(selectedItem.sourceText)">复制原文</button><button class="secondary-button" title="复制原文和译文" @click="copy(bilingualText(selectedItem))">复制双语</button><button class="secondary-button" @click="retranslate(selectedItem)"><AppIcon name="refresh" :size="15" /> 重新处理</button><button class="primary-button" title="复制译文" @click="copy(selectedItem.resultText)"><AppIcon :name="copied ? 'check' : 'copy'" :size="15" /> {{ copied ? '已复制' : '复制译文' }}</button></div>
        </template>
        <div v-else class="state-message state-message--stack muted"><span class="empty-orb"><AppIcon name="history" /></span><strong>选择一条记录查看详情</strong></div>
      </section>
    </div>
  </div>
</template>
