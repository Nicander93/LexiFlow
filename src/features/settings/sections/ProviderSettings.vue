<script setup lang="ts">
import { ref } from "vue";
import type { AppSettings, ProviderModel } from "../../../../electron/shared/types";
import SettingGroup from "../components/SettingGroup.vue";
import SettingRow from "../components/SettingRow.vue";

defineProps<{
  settings: AppSettings;
  models: ProviderModel[];
  apiKeyConfigured: boolean;
  saving: boolean;
}>();
const emit = defineEmits<{
  save: [apiKey: string];
  test: [apiKey: string];
}>();

const apiKey = ref("");
const advancedOpen = ref(false);
</script>

<template>
  <SettingGroup title="模型服务">
    <SettingRow title="模型服务类型">
      <select v-model="settings.provider.type" aria-label="模型服务类型">
        <option value="ollama">Ollama</option>
        <option value="openai-compatible">OpenAI 兼容服务</option>
      </select>
    </SettingRow>
    <SettingRow title="服务地址">
      <input v-model="settings.provider.baseUrl" aria-label="服务地址" placeholder="http://127.0.0.1:11434" />
    </SettingRow>
    <SettingRow title="模型名称">
      <input v-model="settings.provider.model" aria-label="模型名称" list="model-options" placeholder="输入模型名称" />
      <datalist id="model-options"><option v-for="model in models" :key="model.id" :value="model.id" /></datalist>
    </SettingRow>
    <SettingRow v-if="settings.provider.type === 'openai-compatible'" title="API Key">
      <input v-model="apiKey" aria-label="API Key" type="password" autocomplete="new-password" :placeholder="apiKeyConfigured ? '已安全保存，输入新值可覆盖' : '使用系统安全存储加密'" />
    </SettingRow>
    <SettingRow title="启用推理模式">
      <label class="ios-switch"><input v-model="settings.provider.enableReasoning" type="checkbox" aria-label="启用推理模式" /><span /></label>
    </SettingRow>
    <SettingRow title="请求超时">
      <input v-model.number="settings.provider.timeoutMs" aria-label="请求超时" type="number" min="1000" />
    </SettingRow>
    <SettingRow v-if="settings.provider.type === 'ollama'" title="模型常驻时间">
      <input v-model="settings.provider.keepAlive" aria-label="模型常驻时间" placeholder="5m" />
    </SettingRow>
    <div v-if="settings.provider.type === 'openai-compatible'" class="privacy-warning">输入内容会发送到远程模型服务，请确认该服务的隐私政策。</div>
    <div class="settings-actions">
      <button class="secondary-button" :disabled="saving" @click="emit('save', apiKey)">保存</button>
      <button class="primary-button" :disabled="saving" @click="emit('test', apiKey)">保存并测试连接</button>
    </div>
  </SettingGroup>

  <SettingGroup title="模型路由">
    <button class="settings-disclosure" type="button" :aria-expanded="advancedOpen" @click="advancedOpen = !advancedOpen">
      <span>高级模型路由</span><span>{{ advancedOpen ? "收起" : "展开" }}</span>
    </button>
    <template v-if="advancedOpen">
      <SettingRow title="启用自动模型路由">
        <label class="ios-switch"><input v-model="settings.routing.enabled" type="checkbox" aria-label="启用自动模型路由" /><span /></label>
      </SettingRow>
      <SettingRow title="短文本阈值"><input v-model.number="settings.routing.shortTextMaxLength" aria-label="短文本阈值" type="number" min="1" /></SettingRow>
      <SettingRow title="短文本模型"><input v-model="settings.routing.shortTextModel" aria-label="短文本模型" list="model-options" placeholder="留空使用全局模型" /></SettingRow>
      <SettingRow title="文档模型"><input v-model="settings.routing.documentModel" aria-label="文档模型" list="model-options" placeholder="留空使用全局模型" /></SettingRow>
    </template>
  </SettingGroup>
</template>
