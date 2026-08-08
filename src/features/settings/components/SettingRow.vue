<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
  disabled?: boolean;
}>();
</script>

<template>
  <div class="setting-row" :class="{ 'is-disabled': disabled }">
    <div class="setting-row__copy">
      <strong>{{ title }}</strong>
      <small v-if="description">{{ description }}</small>
    </div>
    <div class="setting-row__control"><slot /></div>
  </div>
</template>
