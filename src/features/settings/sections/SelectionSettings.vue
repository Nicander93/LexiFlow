<script setup lang="ts">
import type { AppSettings, TranslationProfile } from "../../../../electron/shared/types";
import UiSelect from "../../../components/UiSelect.vue";
import SettingGroup from "../components/SettingGroup.vue";
import SettingRow from "../components/SettingRow.vue";
import ShortcutRecorder from "../ShortcutRecorder.vue";
import { DEFAULT_SETTINGS } from "../../../../electron/shared/defaults";

const props = defineProps<{ settings: AppSettings; profiles: TranslationProfile[] }>();
const emit = defineEmits<{ save: []; error: [message: string] }>();

function commitShortcut(key: "translation" | "naming" | "screenshot", value: string): void {
  props.settings.shortcuts[key] = value;
  emit("save");
}

function restoreRecommendedShortcuts(): void {
  props.settings.shortcuts.translation = DEFAULT_SETTINGS.shortcuts.translation;
  props.settings.shortcuts.naming = DEFAULT_SETTINGS.shortcuts.naming;
  props.settings.shortcuts.screenshot = DEFAULT_SETTINGS.shortcuts.screenshot;
  emit("save");
}
</script>

<template>
  <SettingGroup title="划词翻译">
    <SettingRow title="启用划词翻译" description="选中文字后显示悬浮翻译按钮">
      <label class="ios-switch"><input v-model="settings.shortcuts.enableSelectionTranslation" type="checkbox" aria-label="启用划词翻译" @change="emit('save')" /><span /></label>
    </SettingRow>
  </SettingGroup>

  <SettingGroup title="全局快捷键" description="LexiFlow 在后台运行时生效。推荐使用三修饰键组合，减少与 VS Code 等开发工具冲突；清空表示停用。">
    <SettingRow title="推荐快捷键" description="恢复低冲突的 Ctrl + Alt + Shift 组合">
      <button type="button" class="secondary-button" @click="restoreRecommendedShortcuts">恢复推荐组合</button>
    </SettingRow>
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
      <UiSelect
        :model-value="settings.shortcuts.defaultTranslationProfileId"
        :options="profiles.map((profile) => ({ value: profile.id, label: profile.name }))"
        label="快速翻译默认配置"
        @update:model-value="settings.shortcuts.defaultTranslationProfileId = $event; emit('save')"
      />
    </SettingRow>
  </SettingGroup>
</template>
