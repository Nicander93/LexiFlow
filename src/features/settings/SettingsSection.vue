<script setup lang="ts">
import AppIcon from "../../components/AppIcon.vue";

defineProps<{
  title: string;
  description: string;
  icon: "server" | "keyboard" | "translate" | "settings";
}>();
</script>

<template>
  <section class="settings-section surface">
    <header class="settings-section__header">
      <span class="settings-section__icon"><AppIcon :name="icon" /></span>
      <div><h2>{{ title }}</h2><p>{{ description }}</p></div>
      <div class="settings-section__aside"><slot name="aside" /></div>
    </header>
    <div class="settings-section__body"><slot /></div>
  </section>
</template>
