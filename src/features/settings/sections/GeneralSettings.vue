<script setup lang="ts">
import type { AppSettings } from "../../../../electron/shared/types";
import SettingGroup from "../components/SettingGroup.vue";
import SettingRow from "../components/SettingRow.vue";

defineProps<{ settings: AppSettings }>();
const emit = defineEmits<{ save: [] }>();
</script>

<template>
  <SettingGroup title="应用行为">
    <SettingRow title="界面字体大小" description="默认 14px，等同于窗口中的放大/缩小效果">
      <div class="font-size-control">
        <button type="button" aria-label="减小字体" :disabled="settings.window.fontSize <= 10" @click="settings.window.fontSize = Math.max(10, settings.window.fontSize - 1); emit('save')">−</button>
        <input v-model.number="settings.window.fontSize" aria-label="界面字体大小" type="number" min="10" max="24" step="1" @blur="emit('save')" @keydown.enter="($event.target as HTMLInputElement).blur()" />
        <span>px</span>
        <button type="button" aria-label="增大字体" :disabled="settings.window.fontSize >= 24" @click="settings.window.fontSize = Math.min(24, settings.window.fontSize + 1); emit('save')">+</button>
      </div>
    </SettingRow>
    <SettingRow title="Windows 登录时启动">
      <label class="ios-switch"><input v-model="settings.startup.enabled" type="checkbox" aria-label="Windows 登录时启动" @change="emit('save')" /><span /></label>
    </SettingRow>
    <SettingRow title="关闭主窗口时">
      <select v-model="settings.window.closeAction" aria-label="关闭主窗口时" @change="emit('save')">
        <option value="hide">隐藏到托盘</option>
        <option value="quit">退出应用</option>
      </select>
    </SettingRow>
    <SettingRow title="悬浮窗失焦自动隐藏">
      <label class="ios-switch"><input v-model="settings.window.autoHidePopup" type="checkbox" aria-label="悬浮窗失焦自动隐藏" @change="emit('save')" /><span /></label>
    </SettingRow>
  </SettingGroup>

  <SettingGroup title="本地历史">
    <SettingRow title="保存本地历史">
      <label class="ios-switch"><input v-model="settings.history.enabled" type="checkbox" aria-label="保存本地历史" @change="emit('save')" /><span /></label>
    </SettingRow>
    <SettingRow title="最大历史数量" description="按 Enter 或移开焦点后保存">
      <input v-model.number="settings.history.maxItems" aria-label="最大历史数量" type="number" min="1" max="10000" @blur="emit('save')" @keydown.enter="($event.target as HTMLInputElement).blur()" />
    </SettingRow>
    <SettingRow title="历史保留周期">
      <select v-model="settings.history.retention" aria-label="历史保留周期" @change="emit('save')">
        <option value="7d">7 天</option>
        <option value="30d">30 天</option>
        <option value="forever">永久保存</option>
        <option value="clear-on-exit">退出应用时清除</option>
      </select>
    </SettingRow>
  </SettingGroup>
</template>
