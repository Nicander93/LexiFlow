<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <header class="page-header">
    <div class="page-header__title">
      <h1>{{ title }}</h1>
      <slot name="leading" />
    </div>
    <div class="page-header__actions"><slot /></div>
  </header>
</template>
