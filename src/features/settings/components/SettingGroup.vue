<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>

<template>
  <section class="setting-group">
    <header>
      <h2>{{ title }}</h2>
      <p v-if="description">{{ description }}</p>
    </header>
    <div class="setting-group__body"><slot /></div>
  </section>
</template>
