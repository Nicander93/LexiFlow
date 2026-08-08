<script setup lang="ts">
import wordmarkUrl from "../assets/brand-wordmark.png";

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });
</script>

<template>
  <span class="brand-logo" :class="{ compact }" aria-label="LexiFlow">
    <img :src="wordmarkUrl" alt="LexiFlow" />
  </span>
</template>

<style scoped>
.brand-logo { width: 98px; height: 28px; display: block; overflow: hidden; }
.brand-logo img { display: block; width: 116px; height: auto; margin: -15px 0 0 -9px; }
.brand-logo.compact { width: 72px; height: 22px; }
.brand-logo.compact img { width: 86px; margin: -11px 0 0 -7px; }
</style>
