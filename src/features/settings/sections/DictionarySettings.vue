<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { GlossaryConflict, GlossaryEntry, TranslationProfile } from "../../../../electron/shared/types";
import { getTranslatorApi } from "../../../platform/translator";
import SettingGroup from "../components/SettingGroup.vue";

const emit = defineEmits<{ notify: [message: string, type?: "success" | "error"] }>();
const translator = getTranslatorApi();
const tab = ref<"glossary" | "profiles">("glossary");
const glossary = ref<GlossaryEntry[]>([]);
const conflicts = ref<GlossaryConflict[]>([]);
const profiles = ref<TranslationProfile[]>([]);
const profileDraft = ref<TranslationProfile>();
const draft = ref(emptyDraft());

function emptyDraft() {
  return {
    id: "",
    sourceTerm: "",
    targetTerm: "",
    sourceLanguage: "auto",
    targetLanguage: "auto",
    domain: "",
    note: "",
    matchMode: "word" as GlossaryEntry["matchMode"],
    caseSensitive: false
  };
}

const glossaryGroups = computed(() => {
  const groups = new Map<string, GlossaryEntry[]>();
  for (const entry of glossary.value) {
    const domain = entry.domain?.trim() || "未分组";
    groups.set(domain, [...(groups.get(domain) ?? []), entry]);
  }
  return [...groups.entries()].map(([domain, entries]) => ({ domain, entries }));
});

async function reloadGlossary(): Promise<void> {
  [glossary.value, conflicts.value] = await Promise.all([
    translator.glossary.list(),
    translator.glossary.conflicts()
  ]);
}

async function reloadProfiles(): Promise<void> {
  profiles.value = await translator.profiles.list();
}

async function saveGlossary(): Promise<void> {
  try {
    const now = Date.now();
    const id = draft.value.id || crypto.randomUUID();
    const existing = glossary.value.find((entry) => entry.id === id);
    await translator.glossary.upsert({
      ...draft.value,
      id,
      sourceLanguage: draft.value.sourceLanguage || "auto",
      targetLanguage: draft.value.targetLanguage || "auto",
      domain: draft.value.domain.trim() || undefined,
      note: draft.value.note.trim() || undefined,
      enabled: existing?.enabled ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
    draft.value = emptyDraft();
    await reloadGlossary();
    emit("notify", existing ? "术语已更新。" : "术语已保存。");
  } catch (error) {
    emit("notify", error instanceof Error ? error.message : "术语保存失败。", "error");
  }
}

function editGlossary(entry: GlossaryEntry): void {
  draft.value = {
    id: entry.id,
    sourceTerm: entry.sourceTerm,
    targetTerm: entry.targetTerm,
    sourceLanguage: entry.sourceLanguage,
    targetLanguage: entry.targetLanguage,
    domain: entry.domain ?? "",
    note: entry.note ?? "",
    matchMode: entry.matchMode,
    caseSensitive: entry.caseSensitive
  };
}

async function toggleGlossary(entry: GlossaryEntry): Promise<void> {
  await translator.glossary.upsert({ ...entry, enabled: !entry.enabled });
  await reloadGlossary();
}

async function deleteGlossary(id: string): Promise<void> {
  await translator.glossary.delete(id);
  await reloadGlossary();
}

async function importGlossary(): Promise<void> {
  try {
    const result = await translator.glossary.importCsv();
    await reloadGlossary();
    emit("notify", result.skipped.length
      ? `已导入 ${result.imported} 条，跳过 ${result.skipped.length} 条无效记录。`
      : `已导入 ${result.imported} 条术语。`);
  } catch (error) {
    emit("notify", error instanceof Error ? error.message : "术语表导入失败。", "error");
  }
}

async function exportGlossary(): Promise<void> {
  const result = await translator.glossary.exportCsv();
  if (result.saved) emit("notify", `已导出 ${result.count} 条术语。`);
}

async function copyProfile(profile: TranslationProfile): Promise<void> {
  const copied = {
    ...profile,
    id: crypto.randomUUID(),
    name: `${profile.name}（副本）`,
    allowRemote: profile.allowRemote !== false,
    isBuiltIn: false
  };
  await translator.profiles.upsert(copied);
  await reloadProfiles();
  profileDraft.value = copied;
}

async function saveProfile(): Promise<void> {
  if (!profileDraft.value) return;
  await translator.profiles.upsert(profileDraft.value);
  await reloadProfiles();
  emit("notify", "翻译配置已保存。");
}

async function deleteProfile(profile: TranslationProfile): Promise<void> {
  await translator.profiles.delete(profile.id);
  await reloadProfiles();
  if (profileDraft.value?.id === profile.id) profileDraft.value = undefined;
}

onMounted(() => Promise.all([reloadGlossary(), reloadProfiles()]));
</script>

<template>
  <div class="settings-local-tabs" role="tablist" aria-label="词典与术语分类">
    <button type="button" role="tab" :aria-selected="tab === 'glossary'" :class="{ active: tab === 'glossary' }" @click="tab = 'glossary'">术语表</button>
    <button type="button" role="tab" :aria-selected="tab === 'profiles'" :class="{ active: tab === 'profiles' }" @click="tab = 'profiles'">翻译配置</button>
  </div>

  <SettingGroup v-if="tab === 'glossary'" title="术语表" description="只向模型发送当前文本实际命中的启用术语。">
    <div class="compact-form-grid">
      <label>原术语<input v-model="draft.sourceTerm" placeholder="API" /></label>
      <label>固定译法<input v-model="draft.targetTerm" placeholder="接口" /></label>
      <label>源语言<input v-model="draft.sourceLanguage" placeholder="auto" /></label>
      <label>目标语言<input v-model="draft.targetLanguage" placeholder="zh-CN" /></label>
      <label>领域<input v-model="draft.domain" placeholder="可选" /></label>
      <label>匹配方式<select v-model="draft.matchMode"><option value="word">完整单词</option><option value="exact">精确文本</option><option value="phrase">短语</option></select></label>
      <label class="wide-field">备注<input v-model="draft.note" placeholder="可选说明" /></label>
    </div>
    <div class="settings-actions">
      <button class="primary-button" @click="saveGlossary">{{ draft.id ? "保存修改" : "添加术语" }}</button>
      <button v-if="draft.id" class="text-button" @click="draft = emptyDraft()">取消编辑</button>
      <button class="text-button" @click="importGlossary">导入 CSV</button>
      <button class="text-button" :disabled="!glossary.length" @click="exportGlossary">导出 CSV</button>
    </div>
    <div v-if="conflicts.length" class="privacy-warning">检测到 {{ conflicts.length }} 组术语冲突，请检查重复译法。</div>
    <div class="compact-list">
      <div v-for="group in glossaryGroups" :key="group.domain">
        <h3>{{ group.domain }}</h3>
        <div v-for="entry in group.entries" :key="entry.id" class="compact-list__row">
          <strong>{{ entry.sourceTerm }} → {{ entry.targetTerm }}</strong>
          <small>{{ entry.sourceLanguage }} → {{ entry.targetLanguage }}</small>
          <button class="text-button" @click="editGlossary(entry)">编辑</button>
          <button class="text-button" @click="toggleGlossary(entry)">{{ entry.enabled ? "停用" : "启用" }}</button>
          <button class="text-button danger" @click="deleteGlossary(entry.id)">删除</button>
        </div>
      </div>
    </div>
  </SettingGroup>

  <SettingGroup v-else title="翻译配置" description="复制内置配置后可进行本地编辑。">
    <div class="compact-list">
      <div v-for="profile in profiles" :key="profile.id" class="compact-list__row">
        <strong>{{ profile.name }}</strong>
        <small>{{ profile.description || "自定义翻译配置" }}</small>
        <button v-if="profile.isBuiltIn" class="text-button" @click="copyProfile(profile)">复制并编辑</button>
        <button v-else class="text-button" @click="profileDraft = { ...profile }">编辑</button>
        <button v-if="!profile.isBuiltIn" class="text-button danger" @click="deleteProfile(profile)">删除</button>
      </div>
    </div>
    <div v-if="profileDraft" class="profile-editor compact-editor">
      <div class="compact-form-grid">
        <label>名称<input v-model="profileDraft.name" /></label>
        <label>目标语言<select v-model="profileDraft.targetLanguage"><option value="auto">自动</option><option value="zh-CN">中文</option><option value="en">英文</option></select></label>
        <label>词典模式<select v-model="profileDraft.dictionaryMode"><option value="off">关闭</option><option value="basic">基础</option><option value="contextual">上下文</option></select></label>
        <label>指定模型<input v-model="profileDraft.modelId" placeholder="留空使用全局模型" /></label>
      </div>
      <label class="wide-field">系统提示词<textarea v-model="profileDraft.systemPrompt" /></label>
      <div class="settings-actions"><button class="primary-button" @click="saveProfile">保存翻译配置</button></div>
    </div>
  </SettingGroup>
</template>
