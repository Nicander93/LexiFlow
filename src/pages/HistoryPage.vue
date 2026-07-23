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
const filteredItems = computed(() => {
  const value = keyword.value.trim().toLowerCase();
  if (!value) return items.value;
  return items.value.filter((item) =>
    item.sourceText.toLowerCase().includes(value) || item.resultText.toLowerCase().includes(value)
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
    <PageHeader eyebrow="History" title="回到最近读过的句子" description="记录只保存在这台设备中，可以搜索、复制或重新处理。">
      <button class="secondary-button danger" :disabled="!items.length" @click="showClearConfirm = true"><AppIcon name="trash" :size="15" /> 清空全部</button>
    </PageHeader>
    <div v-if="showClearConfirm" class="confirm-strip"><span>确定清空全部本地历史吗？此操作无法撤销。</span><div><button class="text-button" @click="showClearConfirm = false">取消</button><button class="secondary-button danger" @click="clearAll">确认清空</button></div></div>
    <div class="history-layout">
      <section class="history-list surface">
        <div class="search-wrap"><AppIcon name="search" :size="17" /><input v-model="keyword" class="search-input" placeholder="搜索原文或译文" /></div>
        <div v-if="loading" class="state-message muted"><span class="spinner" />正在读取本地记录</div>
        <div v-else-if="!filteredItems.length" class="state-message state-message--stack muted"><span class="empty-orb"><AppIcon name="history" /></span><strong>还没有匹配的记录</strong><small>完成一次翻译后，它会安静地留在这里</small></div>
        <div v-else class="history-items"><button v-for="item in filteredItems" :key="item.id" class="history-item" :class="{ active: selectedItem?.id === item.id }" @click="selectedItem = item">
          <span class="history-mode">{{ modeLabel(item.mode) }}</span><strong>{{ item.sourceText }}</strong><small>{{ new Date(item.createdAt).toLocaleString() }} · {{ item.model }}</small>
        </button></div>
      </section>
      <section class="history-detail surface">
        <template v-if="selectedItem">
          <div class="panel-toolbar"><span>详情</span><button class="text-button danger" @click="deleteItem(selectedItem.id)">删除</button></div>
          <h3>原文</h3><pre>{{ selectedItem.sourceText }}</pre>
          <h3>结果</h3><pre>{{ selectedItem.resultText }}</pre>
          <div class="form-actions"><button class="secondary-button" @click="retranslate(selectedItem)"><AppIcon name="refresh" :size="15" /> 重新处理</button><button class="primary-button" @click="copy(selectedItem.resultText)"><AppIcon :name="copied ? 'check' : 'copy'" :size="15" /> {{ copied ? '已复制' : '复制结果' }}</button></div>
        </template>
        <div v-else class="state-message state-message--stack muted"><span class="empty-orb"><AppIcon name="history" /></span><strong>选择一条记录查看详情</strong></div>
      </section>
    </div>
  </div>
</template>
