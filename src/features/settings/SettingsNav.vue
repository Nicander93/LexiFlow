<script setup lang="ts">
export type SettingsCategory = "general" | "selection" | "translation" | "provider" | "dictionary" | "advanced";

defineProps<{ modelValue: SettingsCategory }>();
const emit = defineEmits<{ "update:modelValue": [value: SettingsCategory] }>();

const items: Array<{ id: SettingsCategory; label: string }> = [
  { id: "general", label: "常规" },
  { id: "selection", label: "划词与快捷键" },
  { id: "translation", label: "翻译" },
  { id: "provider", label: "模型服务" },
  { id: "dictionary", label: "词典与术语" },
  { id: "advanced", label: "高级" }
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
      {{ item.label }}
    </button>
  </nav>
</template>
