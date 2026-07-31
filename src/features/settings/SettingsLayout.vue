<script setup lang="ts">
import SettingsNav, { type SettingsCategory } from "./SettingsNav.vue";

defineProps<{ category: SettingsCategory; title: string; description: string }>();
const emit = defineEmits<{ "update:category": [value: SettingsCategory] }>();
</script>

<template>
  <div class="settings-layout">
    <SettingsNav :model-value="category" @update:model-value="emit('update:category', $event)" />
    <div class="settings-content">
      <header class="settings-content__header">
        <h1>{{ title }}</h1>
        <p>{{ description }}</p>
      </header>
      <slot />
    </div>
  </div>
</template>
