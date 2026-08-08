<script setup lang="ts">
import AppIcon from "../../components/AppIcon.vue";

export type SettingsCategory = "general" | "selection" | "translation" | "provider" | "advanced";

defineProps<{ modelValue: SettingsCategory }>();
const emit = defineEmits<{ "update:modelValue": [value: SettingsCategory] }>();

const items: Array<{ id: SettingsCategory; label: string; icon: "settings" | "keyboard" | "translate" | "server" | "info" }> = [
  { id: "general", label: "常规", icon: "settings" },
  { id: "selection", label: "划词与快捷键", icon: "keyboard" },
  { id: "translation", label: "翻译", icon: "translate" },
  { id: "provider", label: "模型服务", icon: "server" },
  { id: "advanced", label: "高级", icon: "info" }
];
</script>

<template>
  <nav class="settings-nav" aria-label="设置分类">
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      :class="{ active: modelValue === item.id }"
      :aria-current="modelValue === item.id ? 'page' : undefined"
      @click="emit('update:modelValue', item.id)"
    >
      <AppIcon :name="item.icon" :size="14" />
      <span>{{ item.label }}</span>
    </button>
  </nav>
</template>
