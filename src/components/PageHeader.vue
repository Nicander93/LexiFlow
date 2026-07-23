<script setup lang="ts">
withDefaults(defineProps<{ title: string; description: string; eyebrow?: string }>(), {
  eyebrow: "LexiFlow"
});
</script>

<template>
  <header class="page-header">
    <div><span class="eyebrow">{{ eyebrow }}</span><h1>{{ title }}</h1><p>{{ description }}</p></div>
    <div class="page-header__actions"><slot /></div>
  </header>
</template>
