<script setup lang="ts">
import { computed, nextTick, watch, ref } from "vue";
import type { TranslationHistory } from "../../../../electron/shared/types";
import AppIcon from "../../../components/AppIcon.vue";
import { getTranslatorApi } from "../../../platform/translator";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; restore: [item: TranslationHistory] }>();
const translator = getTranslatorApi();
const items = ref<TranslationHistory[]>([]);
const query = ref("");
const loading = ref(false);
const error = ref("");
const search = ref<HTMLInputElement>();
const panel = ref<HTMLElement>();
const restoring = ref(false);
const pendingFavorites = ref(new Set<string>());
let openedFrom: HTMLElement | undefined;
let loadSequence = 0;

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

async function load(): Promise<void> {
  const sequence = ++loadSequence;
  loading.value = true;
  error.value = "";
  try {
    const saved = await translator.history.list();
    if (sequence === loadSequence) items.value = saved;
  } catch {
    if (sequence === loadSequence) error.value = "无法读取历史记录。";
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}

watch(() => props.open, async (open) => {
  if (!open) {
    loadSequence += 1;
    await nextTick();
    if (openedFrom?.isConnected) openedFrom.focus({ preventScroll: true });
    return;
  }
  openedFrom = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  await nextTick();
  search.value?.focus({ preventScroll: true });
  if (props.open) void load();
});

async function restore(item: TranslationHistory): Promise<void> {
  if (restoring.value) return;
  restoring.value = true;
  error.value = "";
  try {
    if (!await translator.translation.openHistorySession(item.id)) throw new Error("记录已不存在。");
    emit("restore", item);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "无法打开历史记录。";
  } finally { restoring.value = false; }
}

async function favorite(item: TranslationHistory): Promise<void> {
  if (pendingFavorites.value.has(item.id)) return;
  pendingFavorites.value.add(item.id);
  error.value = "";
  try {
    const next = await translator.history.toggleFavorite(item.id);
    if (next) Object.assign(item, next);
  } catch { error.value = "无法更新收藏，请重试。"; }
  finally { pendingFavorites.value.delete(item.id); }
}

function handleTab(event: KeyboardEvent): void {
  const controls = panel.value?.querySelectorAll<HTMLElement>("button:not(:disabled), input");
  if (!controls?.length) return;
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
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
    <div v-show="open" class="drawer-layer" :inert="!open" @click.self="emit('close')">
      <aside ref="panel" class="history-drawer" role="dialog" aria-label="历史记录" @keydown.esc.stop="emit('close')" @keydown.tab="handleTab">
        <header>
          <h2>历史</h2>
          <button class="icon-button" type="button" aria-label="关闭历史" @click="emit('close')">×</button>
        </header>
        <label class="drawer-search">
          <AppIcon name="search" :size="14" />
          <input ref="search" v-model="query" type="search" aria-label="搜索历史记录" placeholder="搜索历史记录" />
        </label>
        <p v-if="error" class="drawer-error error-text" role="alert">{{ error }} <button class="text-button" type="button" @click="load">刷新</button></p>
        <div v-if="loading && !items.length" class="drawer-empty" role="status"><span class="spinner" />正在读取</div>
        <div v-else-if="!filtered.length && !error" class="drawer-empty">
          <template v-if="query.trim()">没有匹配的历史记录 <button class="text-button" type="button" @click="query = ''; search?.focus()">清除搜索</button></template>
          <template v-else>完成一次翻译后，记录会留在这里</template>
        </div>
        <div v-else class="drawer-list">
          <section
            v-for="item in filtered"
            :key="item.id"
            class="drawer-item"
          >
            <div>
              <small>{{ item.kind === 'dictionary' ? '词典' : item.mode === 'naming' ? '命名' : item.origin === 'ocr' ? 'OCR' : '翻译' }}</small>
              <button type="button" aria-label="收藏" :aria-pressed="item.isFavorite" :disabled="pendingFavorites.has(item.id)" @click="favorite(item)">{{ item.isFavorite ? '★' : '☆' }}</button>
            </div>
            <button class="drawer-item__restore" type="button" :disabled="restoring" @click="restore(item)">
              <strong>{{ item.sourceText }}</strong>
              <span>{{ item.resultText }}</span>
              <time>{{ meta(item) }}</time>
            </button>
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
  padding: 10px; border-bottom: 1px solid var(--border);
}
.drawer-item__restore:hover { background: var(--accent-soft); }
.drawer-item div { display: flex; justify-content: space-between; }
.drawer-item small { color: var(--accent-strong); font-size: 12px; }
.drawer-item button { border: 0; color: var(--muted); background: none; cursor: pointer; }
.drawer-item .drawer-item__restore { display: block; width: 100%; padding: 4px; text-align: left; border-radius: var(--radius-sm); }
.drawer-item strong, .drawer-item__restore span {
  display: block; overflow: hidden; margin: 4px 0; text-overflow: ellipsis; white-space: nowrap; font-size: 13px;
}
.drawer-item strong { color: var(--ink); }
.drawer-item__restore span, .drawer-item time { color: var(--muted); font-size: 12px; }
.drawer-error { margin: 0 12px 8px; }
.drawer-empty {
  display: flex; align-items: center; justify-content: center; gap: 7px; flex: 1;
  padding: 24px; color: var(--muted); font-size: 13px; text-align: center;
}
.drawer-enter-active, .drawer-leave-active { transition: opacity var(--motion-panel) var(--motion-ease); }
.drawer-enter-active .history-drawer, .drawer-leave-active .history-drawer { transition: transform var(--motion-panel) var(--motion-ease); }
.drawer-leave-active { pointer-events: none; }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from .history-drawer, .drawer-leave-to .history-drawer { transform: translateX(100%); }
</style>
