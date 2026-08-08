<script setup lang="ts">
import type { AppSettings, TranslationProfile } from "../../../../electron/shared/types";
import SettingGroup from "../components/SettingGroup.vue";
import SettingRow from "../components/SettingRow.vue";
import ShortcutRecorder from "../ShortcutRecorder.vue";

const props = defineProps<{ settings: AppSettings; profiles: TranslationProfile[] }>();
const emit = defineEmits<{ save: []; error: [message: string] }>();

function commitShortcut(key: "translation" | "naming" | "screenshot", value: string): void {
  props.settings.shortcuts[key] = value;
  emit("save");
}
</script>

<template>
  <SettingGroup title="划词翻译">
    <SettingRow title="启用划词翻译" description="选中文字后显示悬浮翻译按钮">
      <label class="ios-switch"><input v-model="settings.shortcuts.enableSelectionTranslation" type="checkbox" aria-label="启用划词翻译" @change="emit('save')" /><span /></label>
    </SettingRow>
  </SettingGroup>

  <SettingGroup title="全局快捷键" description="点击后直接按下组合键；清空表示停用该快捷键。">
    <SettingRow title="暂停全部快捷键">
      <label class="ios-switch"><input v-model="settings.shortcuts.paused" type="checkbox" aria-label="暂停全部快捷键" @change="emit('save')" /><span /></label>
    </SettingRow>
    <SettingRow title="快速翻译">
      <ShortcutRecorder
        v-model="settings.shortcuts.translation"
        shortcut-key="translation"
        :shortcuts="settings.shortcuts"
        label="录制快速翻译快捷键"
        @commit="commitShortcut('translation', $event)"
        @error="emit('error', $event)"
      />
    </SettingRow>
    <SettingRow title="编程命名">
      <ShortcutRecorder
        v-model="settings.shortcuts.naming"
        shortcut-key="naming"
        :shortcuts="settings.shortcuts"
        label="录制编程命名快捷键"
        @commit="commitShortcut('naming', $event)"
        @error="emit('error', $event)"
      />
    </SettingRow>
    <SettingRow title="截图 OCR">
      <ShortcutRecorder
        v-model="settings.shortcuts.screenshot"
        shortcut-key="screenshot"
        :shortcuts="settings.shortcuts"
        label="录制截图 OCR 快捷键"
        @commit="commitShortcut('screenshot', $event)"
        @error="emit('error', $event)"
      />
    </SettingRow>
    <SettingRow title="快速翻译默认配置">
      <select v-model="settings.shortcuts.defaultTranslationProfileId" aria-label="快速翻译默认配置" @change="emit('save')">
        <option v-for="profile in profiles" :key="profile.id" :value="profile.id">{{ profile.name }}</option>
      </select>
    </SettingRow>
  </SettingGroup>
</template>
