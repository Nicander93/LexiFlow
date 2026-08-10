<script setup lang="ts">
import { computed, watch, ref } from "vue";
import type { TranslationHistory } from "../../../../electron/shared/types";
import AppIcon from "../../../components/AppIcon.vue";
import { getTranslatorApi } from "../../../platform/translator";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; restore: [item: TranslationHistory] }>();
const translator = getTranslatorApi();
const items = ref<TranslationHistory[]>([]);
const query = ref("");
const loading = ref(false);

const originLabel: Record<string, string> = {
  main: "主窗口",
  popup: "划词",
  ocr: "OCR",
  history: "历史恢复"
};

const filtered = computed(() => {
  const value = query.value.trim().toLocaleLowerCase();
  return items.value.filter((item) => !value
    || item.sourceText.toLocaleLowerCase().includes(value)
    || item.resultText.toLocaleLowerCase().includes(value));
});

watch(() => props.open, async (open) => {
  if (!open) return;
  loading.value = true;
  try { items.value = await translator.history.list(); }
  finally { loading.value = false; }
});

async function restore(item: TranslationHistory): Promise<void> {
  await translator.translation.openHistorySession(item.id);
  emit("restore", item);
}

async function favorite(item: TranslationHistory): Promise<void> {
  const next = await translator.history.toggleFavorite(item.id);
  if (next) Object.assign(item, next);
}

function meta(item: TranslationHistory): string {
  const time = new Date(item.updatedAt ?? item.createdAt).toLocaleString([], { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const origin = originLabel[item.origin ?? "main"] ?? "主窗口";
  const usage = (item.usageCount ?? 1) > 1 ? ` · ${item.usageCount} 次` : "";
  return `${time} · ${origin}${usage}`;
}
</script>

<template>
  <Transition name="drawer">
    <div v-if="open" class="drawer-layer" @click.self="emit('close')">
      <aside class="history-drawer" aria-label="历史记录">
        <header>
          <h2>历史</h2>
          <button class="icon-button" type="button" aria-label="关闭历史" @click="emit('close')">×</button>
        </header>
        <label class="drawer-search">
          <AppIcon name="search" :size="14" />
          <input v-model="query" placeholder="搜索历史记录" />
        </label>
        <div v-if="loading" class="drawer-empty"><span class="spinner" />正在读取</div>
        <div v-else-if="!filtered.length" class="drawer-empty">完成一次翻译后，记录会留在这里</div>
        <div v-else class="drawer-list">
          <section
            v-for="item in filtered"
            :key="item.id"
            class="drawer-item"
            tabindex="0"
            @click="restore(item)"
            @keydown.enter="restore(item)"
          >
            <div>
              <small>{{ item.kind === 'dictionary' ? '词典' : item.mode === 'naming' ? '命名' : item.origin === 'ocr' ? 'OCR' : '翻译' }}</small>
              <button type="button" :aria-label="item.isFavorite ? '取消收藏' : '收藏'" @click.stop="favorite(item)">{{ item.isFavorite ? '★' : '☆' }}</button>
            </div>
            <strong>{{ item.sourceText }}</strong>
            <p>{{ item.resultText }}</p>
            <time>{{ meta(item) }}</time>
          </section>
        </div>
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.drawer-layer { position: fixed; inset: 42px 0 0; z-index: 15; background: rgba(44,49,42,.08); }
.history-drawer {
  position: absolute; inset: 0 0 0 auto; width: min(330px, 88vw); display: flex; flex-direction: column;
  border-left: 1px solid var(--border); background: var(--surface); box-shadow: -12px 0 32px rgba(51,59,48,.09);
}
header {
  height: 48px; display: flex; align-items: center; justify-content: space-between;
  padding: 0 14px 0 16px; border-bottom: 1px solid var(--border);
}
header h2 { margin: 0; font-size: 15px; }
.drawer-search { position: relative; display: block; margin: 12px; }
.drawer-search .app-icon { position: absolute; top: 9px; left: 10px; color: var(--muted); }
.drawer-search input { height: 34px; padding-left: 32px; font-size: 13px; }
.drawer-list { overflow: auto; padding: 0 10px 12px; }
.drawer-item {
  padding: 12px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background .18s ease;
}
.drawer-item:hover, .drawer-item:focus-visible { outline: 0; background: var(--accent-soft); }
.drawer-item div { display: flex; justify-content: space-between; }
.drawer-item small { color: var(--accent-strong); font-size: 12px; }
.drawer-item button { border: 0; color: var(--muted); background: none; cursor: pointer; }
.drawer-item strong, .drawer-item p {
  display: block; overflow: hidden; margin: 4px 0; text-overflow: ellipsis; white-space: nowrap; font-size: 13px;
}
.drawer-item p, .drawer-item time { color: var(--muted); font-size: 12px; }
.drawer-empty {
  display: flex; align-items: center; justify-content: center; gap: 7px; flex: 1;
  padding: 24px; color: var(--muted); font-size: 13px; text-align: center;
}
.drawer-enter-active, .drawer-leave-active { transition: opacity .2s ease; }
.drawer-enter-active .history-drawer, .drawer-leave-active .history-drawer { transition: transform .22s ease; }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from .history-drawer, .drawer-leave-to .history-drawer { transform: translateX(100%); }
</style>
