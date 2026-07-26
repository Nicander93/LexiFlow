<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import AppIcon from "../components/AppIcon.vue";
import PageHeader from "../components/PageHeader.vue";
import { getTranslatorApi } from "../platform/translator";
import type { DocumentTaskRecord, TranslationProfile } from "../../electron/shared/types";

const translator = getTranslatorApi();
const tasks = ref<DocumentTaskRecord[]>([]);
const profiles = ref<TranslationProfile[]>([]);
const profileId = ref("general");
const busy = ref(false);
const error = ref("");
const updateTask = (task: DocumentTaskRecord) => { const index = tasks.value.findIndex((item) => item.id === task.id); if (index < 0) tasks.value.unshift(task); else tasks.value[index] = task; };
async function reload(): Promise<void> { tasks.value = await translator.documents.list(); }
async function importDocument(): Promise<void> { busy.value = true; error.value = ""; try { const task = await translator.documents.import({ profileId: profileId.value }); if (task) updateTask(task); } catch (cause) { error.value = cause instanceof Error ? cause.message : "无法导入文档。"; } finally { busy.value = false; } }
async function start(task: DocumentTaskRecord): Promise<void> { await translator.documents.start(task.id); }
async function pause(task: DocumentTaskRecord): Promise<void> { await translator.documents.pause(task.id); await reload(); }
async function cancel(task: DocumentTaskRecord): Promise<void> { await translator.documents.cancel(task.id); await reload(); }
async function remove(task: DocumentTaskRecord): Promise<void> { await translator.documents.delete(task.id); tasks.value = tasks.value.filter((item) => item.id !== task.id); }
async function exportTask(task: DocumentTaskRecord, format: "translated" | "bilingual" | "json"): Promise<void> { await translator.documents.export({ taskId: task.id, format }); }
const unsubscribe = translator.documents.onEvent((event) => updateTask(event.task));
onMounted(async () => { profiles.value = await translator.profiles.list(); await reload(); });
onUnmounted(unsubscribe);
</script>

<template>
  <div class="page">
    <PageHeader title="文档"><div class="document-import"><select v-model="profileId"><option v-for="profile in profiles" :key="profile.id" :value="profile.id">{{ profile.name }}</option></select><button class="primary-button" :disabled="busy" @click="importDocument">{{ busy ? '正在选择…' : '导入文档' }}</button></div></PageHeader>
    <div v-if="error" class="error-card">{{ error }}</div>
    <section v-if="!tasks.length" class="empty-card">导入文档后会显示可暂停、取消与恢复的本地任务。</section>
    <section v-else class="document-list"><article v-for="task in tasks" :key="task.id" class="document-task surface"><div><strong>{{ task.fileName }}</strong><small>{{ task.format.toUpperCase() }} · {{ task.completedChunks }} / {{ task.totalChunks }} · {{ task.status }}{{ task.failedChunks && Object.keys(task.failedChunks).length ? ` · 失败 ${Object.keys(task.failedChunks).length} 块` : '' }}</small><small v-if="task.error" class="error-text">{{ task.error }}</small></div><div class="document-progress"><span :style="{ width: `${task.totalChunks ? task.completedChunks / task.totalChunks * 100 : 0}%` }" /></div><div class="document-actions"><button v-if="task.status === 'created' || task.status === 'paused'" class="secondary-button" @click="start(task)">开始 / 恢复</button><button v-if="task.status === 'failed'" class="secondary-button" @click="start(task)">重试失败分块</button><button v-if="task.status === 'translating'" class="secondary-button" @click="pause(task)">暂停</button><button v-if="task.status === 'translating' || task.status === 'paused'" class="text-button danger" @click="cancel(task)">取消</button><button v-if="task.status === 'completed'" class="text-button" @click="exportTask(task, 'translated')">导出译文</button><button v-if="task.status === 'completed'" class="text-button" @click="exportTask(task, 'bilingual')">导出双语</button><button v-if="task.status === 'completed'" class="text-button" @click="exportTask(task, 'json')">导出 JSON</button><button class="icon-button" title="删除任务" @click="remove(task)"><AppIcon name="trash" :size="15" /></button></div></article></section>
  </div>
</template>
