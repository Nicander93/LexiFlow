<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from "vue";
import AppIcon from "../components/AppIcon.vue";
import InlineConfirm from "../components/InlineConfirm.vue";
import PageHeader from "../components/PageHeader.vue";
import UiSelect from "../components/UiSelect.vue";
import { getTranslatorApi } from "../platform/translator";
import type { DocumentExportRequest, DocumentTaskRecord, DocumentTaskStatus, TranslationProfile } from "../../electron/shared/types";

const translator = getTranslatorApi();
const tasks = ref<DocumentTaskRecord[]>([]);
const profiles = ref<TranslationProfile[]>([]);
const profileId = ref("general");
const loading = ref(true);
const importing = ref(false);
const pending = ref<Record<string, boolean>>({});
const errors = ref<Record<string, string>>({});
const notice = ref("");
const pageError = ref("");
const confirmation = ref<{ id: string; action: "delete" | "cancel" }>();
let confirmationTrigger: HTMLButtonElement | undefined;

const statusLabels: Record<DocumentTaskStatus, string> = {
  created: "待翻译", parsing: "正在读取", translating: "正在翻译", paused: "已暂停",
  completed: "已完成", failed: "翻译失败", cancelled: "已取消"
};
const exportOptions = [
  { value: "translated", label: "仅译文" }, { value: "bilingual", label: "双语对照" }, { value: "json", label: "JSON" }
];
const exportFormat = ref<DocumentExportRequest["format"]>("translated");

function updateTask(task: DocumentTaskRecord): void {
  const index = tasks.value.findIndex((item) => item.id === task.id);
  if (index < 0) tasks.value.unshift(task);
  else if (tasks.value[index].updatedAt <= task.updatedAt) tasks.value[index] = task;
}

async function load(): Promise<void> {
  loading.value = true;
  pageError.value = "";
  try {
    const [savedTasks, savedProfiles] = await Promise.all([translator.documents.list(), translator.profiles.list()]);
    for (const task of [...savedTasks].reverse()) updateTask(task);
    profiles.value = savedProfiles;
  } catch (cause) {
    pageError.value = cause instanceof Error ? cause.message : "无法读取文档任务。";
  } finally {
    loading.value = false;
  }
}

async function run(task: DocumentTaskRecord, action: () => Promise<void>, fallback: string): Promise<boolean> {
  if (pending.value[task.id]) return false;
  pending.value[task.id] = true;
  delete errors.value[task.id];
  try { await action(); return true; }
  catch (cause) {
    errors.value[task.id] = cause instanceof Error ? cause.message : fallback;
    return false;
  } finally { delete pending.value[task.id]; }
}

async function start(task: DocumentTaskRecord): Promise<void> {
  await run(task, () => translator.documents.start(task.id), "无法开始翻译，请重试。");
}

async function importDocument(): Promise<void> {
  if (importing.value) return;
  importing.value = true;
  pageError.value = "";
  notice.value = "";
  try {
    const task = await translator.documents.import({ profileId: profileId.value });
    if (!task) return;
    updateTask(task);
    await start(task);
  } catch (cause) {
    pageError.value = cause instanceof Error ? cause.message : "无法导入文档。";
  } finally { importing.value = false; }
}

async function refreshTask(id: string): Promise<void> {
  const task = (await translator.documents.list()).find((item) => item.id === id);
  if (task) updateTask(task);
}

function pause(task: DocumentTaskRecord): void {
  void run(task, async () => {
    await translator.documents.pause(task.id);
    await refreshTask(task.id);
  }, "无法暂停翻译，请重试。");
}

function askConfirmation(task: DocumentTaskRecord, action: "delete" | "cancel", event: MouseEvent): void {
  confirmationTrigger = event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : undefined;
  confirmation.value = { id: task.id, action };
}

function closeConfirmation(): void {
  confirmation.value = undefined;
  const trigger = confirmationTrigger;
  confirmationTrigger = undefined;
  void nextTick(() => trigger?.focus({ preventScroll: true }));
}

async function confirm(task: DocumentTaskRecord): Promise<void> {
  const request = confirmation.value;
  if (request?.id !== task.id) return;
  if (request.action === "cancel") {
    if (await run(task, async () => {
      await translator.documents.cancel(task.id);
      await refreshTask(task.id);
    }, "无法取消任务，请重试。") && confirmation.value === request) closeConfirmation();
    return;
  }
  if (await run(task, () => translator.documents.delete(task.id), "无法删除任务，请重试。")) {
    tasks.value = tasks.value.filter((item) => item.id !== task.id);
    if (confirmation.value === request) closeConfirmation();
    notice.value = `已删除“${task.fileName}”的翻译任务。`;
  }
}

function exportTask(task: DocumentTaskRecord): void {
  notice.value = "";
  void run(task, async () => {
    if (await translator.documents.export({ taskId: task.id, format: exportFormat.value })) notice.value = `已导出“${task.fileName}”。`;
  }, "无法导出文档，请重试。");
}

const unsubscribe = translator.documents.onEvent((event) => updateTask(event.task));
onMounted(load);
onUnmounted(unsubscribe);
</script>

<template>
  <div class="page documents-page">
    <PageHeader title="文档翻译">
      <button class="primary-button" type="button" :disabled="loading || importing" @click="importDocument">{{ importing ? '正在导入…' : '导入并翻译' }}</button>
    </PageHeader>
    <details v-if="profiles.length > 1" class="document-options">
      <summary>翻译配置</summary>
      <UiSelect v-model="profileId" :options="profiles.map(({ id, name }) => ({ value: id, label: name }))" label="文档翻译配置" />
    </details>
    <Transition name="panel"><div v-if="pageError" class="error-card" role="alert">{{ pageError }} <button class="text-button" type="button" @click="load">刷新任务</button></div></Transition>
    <p class="success-text" role="status">{{ notice }}</p>
    <div v-if="loading" class="loading-card" role="status"><span class="spinner" />正在读取任务</div>
    <section v-else-if="!tasks.length && !pageError" class="empty-card">选择文件后自动开始翻译。翻译在后台进行，可以随时暂停。</section>
    <section v-else class="document-list" aria-label="文档任务">
      <article v-for="task in tasks" :key="task.id" class="document-task surface" :aria-busy="Boolean(pending[task.id])">
        <div class="document-task__info">
          <strong>{{ task.fileName }}</strong>
          <small role="status">{{ statusLabels[task.status] }}<template v-if="task.failedChunks && Object.keys(task.failedChunks).length"> · {{ Object.keys(task.failedChunks).length }} 段失败</template></small>
        </div>
        <div class="document-task__progress">
          <div class="document-progress" role="progressbar" :aria-label="`${task.fileName} 翻译进度`" :aria-valuemax="task.totalChunks || 1" :aria-valuenow="task.completedChunks"><span :style="{ transform: `scaleX(${task.totalChunks ? task.completedChunks / task.totalChunks : 0})` }" /></div>
          <small>{{ task.completedChunks.toLocaleString() }} / {{ task.totalChunks.toLocaleString() }} 段</small>
        </div>
        <div class="document-actions">
          <button v-if="task.status === 'created' || task.status === 'paused' || task.status === 'failed'" class="secondary-button" type="button" :disabled="pending[task.id]" @click="start(task)">{{ task.status === 'paused' ? '继续翻译' : task.status === 'failed' ? '重试翻译' : '开始翻译' }}</button>
          <button v-if="task.status === 'translating'" class="secondary-button" type="button" :disabled="pending[task.id]" @click="pause(task)">暂停</button>
          <button v-if="task.status === 'translating' || task.status === 'paused'" class="text-button danger" type="button" :disabled="pending[task.id]" @click="askConfirmation(task, 'cancel', $event)">取消任务</button>
          <template v-if="task.status === 'completed'">
            <UiSelect class="document-export-format" :model-value="exportFormat" :options="exportOptions" label="导出格式" :disabled="pending[task.id]" @update:model-value="exportFormat = $event as DocumentExportRequest['format']" />
            <button class="secondary-button" type="button" :disabled="pending[task.id]" @click="exportTask(task)">导出</button>
          </template>
          <button v-if="task.status !== 'translating' && task.status !== 'parsing'" class="icon-button danger" type="button" :disabled="pending[task.id]" :aria-label="`删除任务 ${task.fileName}`" title="删除任务" @click="askConfirmation(task, 'delete', $event)"><AppIcon name="trash" :size="15" /></button>
        </div>
        <Transition name="panel"><p v-if="errors[task.id] || task.error" class="error-text document-task__message" role="alert">{{ errors[task.id] || task.error }}</p></Transition>
        <Transition name="panel"><InlineConfirm v-if="confirmation?.id === task.id" class="document-task__message"
          :message="confirmation.action === 'delete' ? '删除这条任务及译文？原文件会保留。' : '取消后，这项任务无法继续。'"
          :action="confirmation.action === 'delete' ? '确认删除' : '确认取消任务'" :busy="pending[task.id]" @cancel="closeConfirmation" @confirm="confirm(task)" /></Transition>
      </article>
    </section>
  </div>
</template>

<style scoped>
.documents-page > .success-text:empty { display: block; margin: 0; }
.document-options { width: max-content; max-width: 100%; margin-bottom: 12px; color: var(--ink-soft); }
.document-options summary { cursor: pointer; }
.document-options .ui-select { min-width: 160px; margin-top: 6px; }
.document-task__info, .document-task__progress { min-width: 0; }
.document-task__info strong, .document-task__message { overflow-wrap: anywhere; }
.document-task__progress small { font-variant-numeric: tabular-nums; }
.document-task__message { grid-column: 1 / -1; margin: 0; }
.document-export-format { width: 108px; }
@media (max-width: 680px) {
  .document-task { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; }
  .document-actions { grid-column: 1 / -1; justify-content: flex-start; }
}
</style>
