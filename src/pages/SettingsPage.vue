<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import PageHeader from "../components/PageHeader.vue";
import SettingsSection from "../features/settings/SettingsSection.vue";
import { DEFAULT_PROMPTS } from "../../electron/shared/defaults";
import type { AppSettings, GlossaryConflict, GlossaryEntry, ProviderModel, TranslationProfile } from "../../electron/shared/types";
import { getTranslatorApi } from "../platform/translator";
import { toIpcPayload } from "../../electron/shared/serialization";

const settings = ref<AppSettings>();
const models = ref<ProviderModel[]>([]);
const message = ref("");
const messageType = ref<"success" | "error">("success");
const checking = ref(false);
const saving = ref(false);
const loadError = ref("");
const showPrompts = ref(false);
const glossary = ref<GlossaryEntry[]>([]);
const glossaryConflicts = ref<GlossaryConflict[]>([]);
const profiles = ref<TranslationProfile[]>([]);
const glossaryDraft = ref({
  id: "",
  sourceTerm: "",
  targetTerm: "",
  sourceLanguage: "auto",
  targetLanguage: "auto",
  domain: "",
  note: "",
  matchMode: "word" as GlossaryEntry["matchMode"],
  caseSensitive: false
});
const profileDraft = ref<TranslationProfile>();
const showClearDataConfirm = ref(false);
const apiKeyDraft = ref("");
const apiKeyConfigured = ref(false);
const translator = getTranslatorApi();
let autoSaveTimer: ReturnType<typeof setTimeout> | undefined;
let applyingSavedSettings = false;
const glossaryGroups = computed(() => {
  const groups = new Map<string, GlossaryEntry[]>();
  for (const entry of glossary.value) {
    const domain = entry.domain?.trim() || "未分组";
    groups.set(domain, [...(groups.get(domain) ?? []), entry]);
  }
  return [...groups.entries()].map(([domain, entries]) => ({ domain, entries }));
});

function notify(text: string, type: "success" | "error" = "success"): void {
  message.value = text; messageType.value = type;
  setTimeout(() => (message.value = ""), 4000);
}

function syncApiKeyState(next: AppSettings): void {
  apiKeyConfigured.value = Boolean(next.provider.apiKeyConfigured);
  apiKeyDraft.value = "";
}

function buildSettingsPayload(): AppSettings {
  const payload = toIpcPayload(settings.value!);
  payload.provider.apiKey = apiKeyDraft.value;
  payload.provider.apiKeyConfigured = apiKeyDraft.value.trim() ? false : apiKeyConfigured.value;
  return payload;
}

async function save(): Promise<boolean> {
  if (!settings.value || saving.value) return false;
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = undefined;
  }
  const requiresRemoteConfirmation = settings.value.provider.type === "openai-compatible" && !settings.value.provider.remoteUsageConfirmed;
  if (requiresRemoteConfirmation) {
    const accepted = window.confirm("远程模型会收到待翻译内容。请确认你已了解该服务的隐私政策，并同意将内容发送给此远程服务。");
    if (!accepted) return false;
  }
  saving.value = true;
  applyingSavedSettings = true;
  if (requiresRemoteConfirmation) settings.value.provider.remoteUsageConfirmed = true;
  if (settings.value.provider.type === "ollama") settings.value.provider.remoteUsageConfirmed = false;
  try {
    const result = await translator.settings.update(buildSettingsPayload());
    settings.value = result.settings;
    syncApiKeyState(result.settings);
    await nextTick();
    if (result.shortcutResult.errors.length) notify(result.shortcutResult.errors.join("\n"), "error");
    else notify("设置已保存。");
    return true;
  } catch (error) {
    notify(error instanceof Error ? error.message : "设置保存失败。", "error");
    return false;
  } finally {
    applyingSavedSettings = false;
    saving.value = false;
  }
}

/** 在用户暂停编辑后保存，避免输入过程中产生频繁 IPC 调用。 */
function scheduleAutoSave(): void {
  if (!settings.value || applyingSavedSettings) return;
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = undefined;
    void save();
  }, 600);
}

watch(settings, scheduleAutoSave, { deep: true });
watch(apiKeyDraft, scheduleAutoSave);

async function checkHealth(): Promise<void> {
  checking.value = true;
  try {
    if (!await save()) return;
    const health = await translator.provider.healthCheck();
    notify(health.message, health.ok ? "success" : "error");
    if (health.ok) models.value = await translator.provider.getModels();
  } catch (error) {
    notify(error instanceof Error ? error.message : "模型服务连接失败。", "error");
  } finally { checking.value = false; }
}

function restorePrompts(): void {
  if (!settings.value) return;
  settings.value.translation.normalPrompt = DEFAULT_PROMPTS.normal;
  settings.value.translation.technicalPrompt = DEFAULT_PROMPTS.technical;
  settings.value.translation.namingPrompt = DEFAULT_PROMPTS.naming;
  notify("已恢复默认提示词，保存后生效。");
}
async function saveGlossary(): Promise<void> {
  try {
    const now = Date.now();
    const id = glossaryDraft.value.id || crypto.randomUUID();
    const existing = glossary.value.find((entry) => entry.id === id);
    await translator.glossary.upsert({
      id,
      sourceTerm: glossaryDraft.value.sourceTerm,
      targetTerm: glossaryDraft.value.targetTerm,
      sourceLanguage: glossaryDraft.value.sourceLanguage || "auto",
      targetLanguage: glossaryDraft.value.targetLanguage || "auto",
      domain: glossaryDraft.value.domain.trim() || undefined,
      note: glossaryDraft.value.note.trim() || undefined,
      caseSensitive: glossaryDraft.value.caseSensitive,
      matchMode: glossaryDraft.value.matchMode,
      enabled: existing?.enabled ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
    glossaryDraft.value = { id: "", sourceTerm: "", targetTerm: "", sourceLanguage: "auto", targetLanguage: "auto", domain: "", note: "", matchMode: "word", caseSensitive: false };
    await reloadGlossary();
    notify(existing ? "术语已更新。" : "术语已保存。");
  } catch (error) { notify(error instanceof Error ? error.message : "术语保存失败。", "error"); }
}
function editGlossary(entry: GlossaryEntry): void {
  glossaryDraft.value = {
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
async function reloadGlossary(): Promise<void> { [glossary.value, glossaryConflicts.value] = await Promise.all([translator.glossary.list(), translator.glossary.conflicts()]); }
async function toggleGlossary(entry: GlossaryEntry): Promise<void> { await translator.glossary.upsert({ ...entry, enabled: !entry.enabled }); await reloadGlossary(); }
async function deleteGlossary(id: string): Promise<void> { await translator.glossary.delete(id); await reloadGlossary(); }
async function importGlossary(): Promise<void> { try { const result = await translator.glossary.importCsv(); await reloadGlossary(); notify(result.skipped.length ? `已导入 ${result.imported} 条，跳过 ${result.skipped.length} 条无效记录。` : `已导入 ${result.imported} 条术语。`); } catch (error) { notify(error instanceof Error ? error.message : "术语表导入失败。", "error"); } }
async function exportGlossary(): Promise<void> { try { const result = await translator.glossary.exportCsv(); if (result.saved) notify(`已导出 ${result.count} 条术语。`); } catch (error) { notify(error instanceof Error ? error.message : "术语表导出失败。", "error"); } }
async function copyProfile(profile: TranslationProfile): Promise<void> {
  const copied: TranslationProfile = { ...profile, id: crypto.randomUUID(), name: `${profile.name}（副本）`, allowRemote: profile.allowRemote !== false, isBuiltIn: false };
  await translator.profiles.upsert(copied); profiles.value = await translator.profiles.list(); profileDraft.value = copied; notify("已创建可编辑的 Profile 副本。");
}
async function saveProfile(): Promise<void> { if (!profileDraft.value) return; try { await translator.profiles.upsert(profileDraft.value); profiles.value = await translator.profiles.list(); notify("Profile 已保存。"); } catch (error) { notify(error instanceof Error ? error.message : "Profile 保存失败。", "error"); } }
async function deleteProfile(profile: TranslationProfile): Promise<void> { await translator.profiles.delete(profile.id); profiles.value = await translator.profiles.list(); if (profileDraft.value?.id === profile.id) profileDraft.value = undefined; }
async function clearLocalData(): Promise<void> {
  try {
    await translator.privacy.clearLocalData();
    settings.value = await translator.settings.get();
    syncApiKeyState(settings.value);
    glossary.value = [];
    glossaryConflicts.value = [];
    profiles.value = await translator.profiles.list();
    profileDraft.value = undefined;
    showClearDataConfirm.value = false;
    notify("本地数据已清除，应用设置已恢复默认值。");
  } catch (error) { notify(error instanceof Error ? error.message : "清除本地数据失败。", "error"); }
}
async function exportDiagnostics(): Promise<void> {
  try {
    const result = await translator.diagnostics.exportReport();
    if (result.saved) notify("已导出脱敏诊断信息。");
  } catch (error) { notify(error instanceof Error ? error.message : "导出诊断失败。", "error"); }
}

onMounted(async () => {
  try {
    const loaded = await translator.settings.get();
    loaded.provider.enableReasoning = loaded.provider.enableReasoning === true;
    settings.value = loaded;
    syncApiKeyState(settings.value);
    const [loadedProfiles] = await Promise.all([translator.profiles.list(), reloadGlossary()]);
    profiles.value = loadedProfiles;
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : "无法读取本地设置。";
  }
});

onUnmounted(() => {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
});
</script>

<template>
  <div class="page settings-page">
    <PageHeader title="设置" />
    <div v-if="message" class="toast" :class="messageType">{{ message }}</div>
    <div v-if="loadError" class="error-card">{{ loadError }}</div>
    <div v-else-if="!settings" class="surface loading-card"><span class="spinner" />正在读取本地设置</div>
    <template v-else>
      <SettingsSection icon="server" title="模型服务" description="选择内容由本地模型还是远程服务处理">
        <template #aside><span class="provider-badge" :class="{ remote: settings.provider.type === 'openai-compatible' }">{{ settings.provider.type === 'ollama' ? '本地模型' : '远程模型' }}</span></template>
        <div class="form-grid">
          <label>Provider<select v-model="settings.provider.type"><option value="ollama">Ollama</option><option value="openai-compatible">OpenAI-compatible</option></select></label>
          <label>Base URL<input v-model="settings.provider.baseUrl" placeholder="http://127.0.0.1:11434" /></label>
          <label>模型名称<input v-model="settings.provider.model" list="model-options" placeholder="手动输入或连接后选择" /><datalist id="model-options"><option v-for="model in models" :key="model.id" :value="model.id" /></datalist></label>
          <label v-if="settings.provider.type === 'openai-compatible'">API Key<input v-model="apiKeyDraft" type="password" autocomplete="new-password" :placeholder="apiKeyConfigured ? '已配置，输入新值可覆盖' : '使用系统安全存储加密'" @input="apiKeyConfigured = false" /></label>
          <label>请求超时（毫秒）<input v-model.number="settings.provider.timeoutMs" type="number" min="1000" /></label>
          <label v-if="settings.provider.type === 'ollama'">模型常驻时间<input v-model="settings.provider.keepAlive" placeholder="5m" /></label>
        </div>
        <div class="toggle-list">
          <div class="toggle-row"><span>启用 Reasoning（开启后可能更慢、占用更多 token）</span><label class="ios-switch"><input v-model="settings.provider.enableReasoning" type="checkbox" /><span /></label></div>
        </div>
        <div v-if="settings.provider.type === 'openai-compatible'" class="privacy-warning">输入内容会发送到远程模型服务，请确认该服务的隐私政策。</div>
        <button class="secondary-button" :disabled="checking" @click="checkHealth">{{ checking ? '正在检查连接' : '保存并测试连接' }}</button>
      </SettingsSection>

      <SettingsSection icon="keyboard" title="全局快捷键" description="使用 Electron accelerator 格式，例如 Ctrl+Alt+T">
        <template #aside><label class="ios-switch" title="暂停快捷键"><input v-model="settings.shortcuts.paused" type="checkbox" /><span /></label></template>
        <div class="form-grid">
        <div class="toggle-list selection-translation-toggle"><div class="toggle-row"><span>启用划词翻译</span><label class="ios-switch"><input v-model="settings.shortcuts.enableSelectionTranslation" type="checkbox" /><span /></label></div><small class="shortcut-setting-hint">选中文字后显示悬浮翻译按钮，点击后打开快速翻译。</small></div>
          <label>快速翻译<input v-model="settings.shortcuts.translation" :disabled="!settings.shortcuts.enableSelectionTranslation" /></label>
          <label>编程命名<input v-model="settings.shortcuts.naming" /></label>
          <label>截图 OCR<input v-model="settings.shortcuts.screenshot" /></label>
          <label>快速翻译默认场景
            <select v-model="settings.shortcuts.defaultTranslationProfileId">
              <option v-for="profile in profiles" :key="profile.id" :value="profile.id">{{ profile.name }}</option>
            </select>
          </label>
        </div>
      </SettingsSection>

      <SettingsSection icon="translate" title="翻译与历史" description="控制默认语言、输入限制和本地记录">
        <div class="form-grid">
          <label>默认目标语言<select v-model="settings.translation.targetLanguage"><option value="auto">自动识别</option><option value="zh-CN">中文</option><option value="en">英文</option></select></label>
          <label>最大输入长度<input v-model.number="settings.translation.maxInputLength" type="number" min="100" max="100000" /></label>
          <label>最大历史数量<input v-model.number="settings.history.maxItems" type="number" min="1" max="10000" /></label>
          <label>历史保留周期<select v-model="settings.history.retention"><option value="7d">7 天</option><option value="30d">30 天</option><option value="forever">永久保存</option><option value="clear-on-exit">退出应用时清除</option></select></label>
        </div>
        <div class="toggle-list">
          <div class="toggle-row"><span>翻译前自动清理文本</span><label class="ios-switch"><input v-model="settings.translation.autoCleanText" type="checkbox" /><span /></label></div>
          <div class="toggle-row"><span>保留原始换行</span><label class="ios-switch"><input v-model="settings.translation.preserveOriginalLineBreaks" type="checkbox" :disabled="!settings.translation.autoCleanText" /><span /></label></div>
          <div class="toggle-row"><span>保护 Markdown 代码块</span><label class="ios-switch"><input v-model="settings.translation.protectCodeBlocks" type="checkbox" :disabled="!settings.translation.autoCleanText" /><span /></label></div>
          <div class="toggle-row"><span>保存本地历史</span><label class="ios-switch"><input v-model="settings.history.enabled" type="checkbox" /><span /></label></div>
          <div class="toggle-row"><span>悬浮窗失焦自动隐藏</span><label class="ios-switch"><input v-model="settings.window.autoHidePopup" type="checkbox" /><span /></label></div>
          <div class="toggle-row"><span>Windows 登录时启动</span><label class="ios-switch"><input v-model="settings.startup.enabled" type="checkbox" /><span /></label></div>
          <label class="toggle-row"><span>关闭主窗口时</span><select v-model="settings.window.closeAction"><option value="hide">隐藏到托盘</option><option value="quit">退出应用</option></select></label>
        </div>
      </SettingsSection>

      <SettingsSection icon="server" title="模型路由" description="仅在当前已选择的 Provider 内切换模型；关闭后始终使用全局模型或 Profile 指定模型">
        <div class="form-grid"><label>短文本阈值（字符）<input v-model.number="settings.routing.shortTextMaxLength" type="number" min="1" /></label><label>短文本模型（可选）<input v-model="settings.routing.shortTextModel" list="model-options" placeholder="留空使用全局模型" /></label><label>文档任务模型（可选）<input v-model="settings.routing.documentModel" list="model-options" placeholder="留空使用全局模型" /></label></div>
        <div class="toggle-row"><span>启用自动模型路由</span><label class="ios-switch"><input v-model="settings.routing.enabled" type="checkbox" /><span /></label></div>
        <p v-if="settings.provider.type === 'openai-compatible'" class="privacy-warning">当前 Provider 为远程服务。启用路由不会切换服务地址，但所选模型仍会收到对应任务内容。</p>
      </SettingsSection>

      <SettingsSection icon="settings" title="隐私与本地数据" description="可一次清除本地历史、术语表、Profile、文档任务和设置">
        <div v-if="showClearDataConfirm" class="confirm-strip"><span>确定清除所有本地数据并恢复默认设置吗？此操作无法撤销。API Key 不会写入日志或诊断导出。</span><div><button class="text-button" @click="showClearDataConfirm = false">取消</button><button class="secondary-button danger" @click="clearLocalData">确认清除</button></div></div>
        <div v-else class="form-actions"><button class="text-button" @click="exportDiagnostics">导出诊断信息</button><button class="secondary-button danger" @click="showClearDataConfirm = true">清除所有本地数据</button></div>
      </SettingsSection>

      <SettingsSection icon="settings" title="高级提示词" description="通常无需修改，恢复默认后记得保存">
        <template #aside><button class="text-button" @click="showPrompts = !showPrompts">{{ showPrompts ? '收起' : '展开编辑' }}</button></template>
        <div v-if="showPrompts" class="prompt-list"><label>普通翻译<textarea v-model="settings.translation.normalPrompt" /></label><label>技术翻译<textarea v-model="settings.translation.technicalPrompt" /></label><label>编程命名<textarea v-model="settings.translation.namingPrompt" /></label><button class="secondary-button" @click="restorePrompts">恢复默认提示词</button></div>
        <p v-else class="muted">当前使用内置提示词。只有在需要严格术语或特殊输出格式时才建议修改。</p>
      </SettingsSection>

      <SettingsSection icon="translate" title="术语表" description="仅向模型发送当前文本中实际命中的启用术语；CSV 导入导出始终保存在本地">
        <div class="form-grid">
          <label>原术语<input v-model="glossaryDraft.sourceTerm" placeholder="API" /></label>
          <label>固定译法<input v-model="glossaryDraft.targetTerm" placeholder="接口" /></label>
          <label>源语言<input v-model="glossaryDraft.sourceLanguage" placeholder="auto / en / zh-CN" /></label>
          <label>目标语言<input v-model="glossaryDraft.targetLanguage" placeholder="auto / en / zh-CN" /></label>
          <label>领域（可选）<input v-model="glossaryDraft.domain" placeholder="软件工程" /></label>
          <label>匹配方式<select v-model="glossaryDraft.matchMode"><option value="word">完整单词</option><option value="exact">精确文本</option><option value="phrase">短语</option></select></label>
          <label class="wide-field">备注<input v-model="glossaryDraft.note" placeholder="可选说明" /></label>
        </div>
        <div class="toggle-row glossary-case"><span>区分大小写</span><label class="ios-switch"><input v-model="glossaryDraft.caseSensitive" type="checkbox" /><span /></label></div>
        <div class="form-actions">
          <button class="secondary-button" @click="saveGlossary">{{ glossaryDraft.id ? '保存修改' : '添加术语' }}</button>
          <button v-if="glossaryDraft.id" class="text-button" @click="glossaryDraft = { id: '', sourceTerm: '', targetTerm: '', sourceLanguage: 'auto', targetLanguage: 'auto', domain: '', note: '', matchMode: 'word', caseSensitive: false }">取消编辑</button>
          <button class="text-button" @click="importGlossary">导入 CSV</button>
          <button class="text-button" :disabled="!glossary.length" @click="exportGlossary">导出 CSV</button>
        </div>
        <div v-if="glossaryConflicts.length" class="privacy-warning"><strong>术语冲突</strong><span v-for="conflict in glossaryConflicts" :key="conflict.sourceTerm">“{{ conflict.sourceTerm }}”存在多个译法：{{ conflict.targets.join(' / ') }}。匹配时按精确匹配、完整单词、短语、区分大小写、最新修改的顺序选择。</span></div>
        <div v-if="glossary.length" class="glossary-list"><div v-for="group in glossaryGroups" :key="group.domain" class="glossary-group"><h4>{{ group.domain }}</h4><div v-for="entry in group.entries" :key="entry.id"><strong>{{ entry.sourceTerm }} → {{ entry.targetTerm }}</strong><small>{{ entry.sourceLanguage }} → {{ entry.targetLanguage }} · {{ entry.matchMode }}{{ entry.note ? ` · ${entry.note}` : '' }}</small><span>{{ entry.enabled ? '启用' : '已停用' }}</span><button class="text-button" @click="editGlossary(entry)">编辑</button><button class="text-button" @click="toggleGlossary(entry)">{{ entry.enabled ? '停用' : '启用' }}</button><button class="text-button danger" @click="deleteGlossary(entry.id)">删除</button></div></div></div>
      </SettingsSection>

      <SettingsSection icon="settings" title="Translation Profile" description="内置 Profile 不可直接修改，复制后可作为本地 Profile 保存">
        <div class="profile-list"><div v-for="profile in profiles" :key="profile.id"><div><strong>{{ profile.name }}</strong><small>{{ profile.description || '自定义翻译配置' }}</small></div><span>{{ profile.isBuiltIn ? '内置' : '本地' }}</span><button v-if="profile.isBuiltIn" class="text-button" @click="copyProfile(profile)">复制并编辑</button><button v-else class="text-button" @click="profileDraft = { ...profile }">编辑</button><button v-if="!profile.isBuiltIn" class="text-button danger" @click="deleteProfile(profile)">删除</button></div></div>
        <div v-if="profileDraft" class="profile-editor"><div class="form-grid"><label>名称<input v-model="profileDraft.name" /></label><label>目标语言<select v-model="profileDraft.targetLanguage"><option value="auto">自动</option><option value="zh-CN">中文</option><option value="en">英文</option></select></label><label>词典模式<select v-model="profileDraft.dictionaryMode"><option value="off">关闭</option><option value="basic">基础</option><option value="contextual">上下文</option></select></label><label>指定模型（可选）<input v-model="profileDraft.modelId" placeholder="留空使用全局模型" /></label><label>温度（0–2）<input v-model.number="profileDraft.temperature" type="number" min="0" max="2" step="0.05" placeholder="0.1" /></label></div><label class="wide-field">系统提示词<textarea v-model="profileDraft.systemPrompt" /></label><div class="toggle-list"><div class="toggle-row"><span>保留 Markdown</span><label class="ios-switch"><input v-model="profileDraft.preserveMarkdown" type="checkbox" /><span /></label></div><div class="toggle-row"><span>保护代码</span><label class="ios-switch"><input v-model="profileDraft.preserveCode" type="checkbox" /><span /></label></div><div class="toggle-row"><span>启用术语表</span><label class="ios-switch"><input v-model="profileDraft.enableGlossary" type="checkbox" /><span /></label></div><div class="toggle-row"><span>允许将内容发送给远程模型</span><label class="ios-switch"><input v-model="profileDraft.allowRemote" type="checkbox" /><span /></label></div></div><button class="secondary-button" @click="saveProfile">保存 Profile</button></div>
      </SettingsSection>
    </template>
  </div>
</template>
