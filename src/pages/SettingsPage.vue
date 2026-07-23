<script setup lang="ts">
import { onMounted, ref } from "vue";
import PageHeader from "../components/PageHeader.vue";
import AppIcon from "../components/AppIcon.vue";
import SettingsSection from "../components/SettingsSection.vue";
import { DEFAULT_PROMPTS } from "../../electron/shared/defaults";
import type { AppSettings, ModelInfo } from "../../electron/shared/types";
import { getTranslatorApi } from "../platform/translator";
import { toIpcPayload } from "../../electron/shared/serialization";

const settings = ref<AppSettings>();
const models = ref<ModelInfo[]>([]);
const message = ref("");
const messageType = ref<"success" | "error">("success");
const checking = ref(false);
const saving = ref(false);
const loadError = ref("");
const showPrompts = ref(false);
const translator = getTranslatorApi();

function notify(text: string, type: "success" | "error" = "success"): void {
  message.value = text; messageType.value = type;
  setTimeout(() => (message.value = ""), 4000);
}

async function save(): Promise<boolean> {
  if (!settings.value) return false;
  saving.value = true;
  try {
    const result = await translator.settings.update(toIpcPayload(settings.value));
    settings.value = result.settings;
    if (result.shortcutResult.errors.length) notify(result.shortcutResult.errors.join("\n"), "error");
    else notify("设置已保存。");
    return true;
  } catch (error) {
    notify(error instanceof Error ? error.message : "设置保存失败。", "error");
    return false;
  } finally {
    saving.value = false;
  }
}

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

onMounted(async () => {
  try {
    settings.value = await translator.settings.get();
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : "无法读取本地设置。";
  }
});
</script>

<template>
  <div class="page settings-page">
    <PageHeader eyebrow="Preferences" title="把 LexiFlow 调成顺手的样子" description="模型、快捷键和本地行为都在这里，修改后会安全地保存在设备上。">
      <button class="primary-button" :disabled="!settings || saving" @click="save"><AppIcon name="check" :size="15" />{{ saving ? '正在保存' : '保存设置' }}</button>
    </PageHeader>
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
          <label v-if="settings.provider.type === 'openai-compatible'">API Key<input v-model="settings.provider.apiKey" type="password" autocomplete="off" placeholder="使用系统安全存储加密" /></label>
          <label>请求超时（毫秒）<input v-model.number="settings.provider.timeoutMs" type="number" min="1000" /></label>
          <label v-if="settings.provider.type === 'ollama'">模型常驻时间<input v-model="settings.provider.keepAlive" placeholder="5m" /></label>
        </div>
        <div v-if="settings.provider.type === 'openai-compatible'" class="privacy-warning">输入内容会发送到远程模型服务，请确认该服务的隐私政策。</div>
        <button class="secondary-button" :disabled="checking" @click="checkHealth">{{ checking ? '正在检查连接' : '保存并测试连接' }}</button>
      </SettingsSection>

      <SettingsSection icon="keyboard" title="全局快捷键" description="使用 Electron accelerator 格式，例如 Alt+Space">
        <template #aside><label class="ios-switch" title="暂停快捷键"><input v-model="settings.shortcuts.paused" type="checkbox" /><span /></label></template>
        <div class="form-grid"><label>快速翻译<input v-model="settings.shortcuts.translation" /></label><label>编程命名<input v-model="settings.shortcuts.naming" /></label></div>
      </SettingsSection>

      <SettingsSection icon="translate" title="翻译与历史" description="控制默认语言、输入限制和本地记录">
        <div class="form-grid">
          <label>默认目标语言<select v-model="settings.translation.targetLanguage"><option value="auto">自动识别</option><option value="zh-CN">中文</option><option value="en">英文</option></select></label>
          <label>最大输入长度<input v-model.number="settings.translation.maxInputLength" type="number" min="100" max="100000" /></label>
          <label>最大历史数量<input v-model.number="settings.history.maxItems" type="number" min="1" max="1000" /></label>
        </div>
        <div class="toggle-list">
          <div class="toggle-row"><span>保存本地历史</span><label class="ios-switch"><input v-model="settings.history.enabled" type="checkbox" /><span /></label></div>
          <div class="toggle-row"><span>悬浮窗失焦自动隐藏</span><label class="ios-switch"><input v-model="settings.window.autoHidePopup" type="checkbox" /><span /></label></div>
          <div class="toggle-row"><span>Windows 登录时启动</span><label class="ios-switch"><input v-model="settings.startup.enabled" type="checkbox" /><span /></label></div>
          <label class="toggle-row"><span>关闭主窗口时</span><select v-model="settings.window.closeAction"><option value="hide">隐藏到托盘</option><option value="quit">退出应用</option></select></label>
        </div>
      </SettingsSection>

      <SettingsSection icon="settings" title="高级提示词" description="通常无需修改，恢复默认后记得保存">
        <template #aside><button class="text-button" @click="showPrompts = !showPrompts">{{ showPrompts ? '收起' : '展开编辑' }}</button></template>
        <div v-if="showPrompts" class="prompt-list"><label>普通翻译<textarea v-model="settings.translation.normalPrompt" /></label><label>技术翻译<textarea v-model="settings.translation.technicalPrompt" /></label><label>编程命名<textarea v-model="settings.translation.namingPrompt" /></label><button class="secondary-button" @click="restorePrompts">恢复默认提示词</button></div>
        <p v-else class="muted">当前使用内置提示词。只有在需要严格术语或特殊输出格式时才建议修改。</p>
      </SettingsSection>
    </template>
  </div>
</template>
