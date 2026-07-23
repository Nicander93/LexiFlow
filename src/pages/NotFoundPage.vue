<script setup lang="ts">
import AppIcon from "../components/AppIcon.vue";
</script>

<template>
  <div class="page">
    <section class="runtime-failure">
      <span class="empty-orb"><AppIcon name="search" :size="24" /></span>
      <p class="eyebrow">404</p>
      <h1>这个页面走远了</h1>
      <p>地址可能已经改变，返回翻译页继续处理文字吧。</p>
      <RouterLink class="primary-button" to="/">返回翻译</RouterLink>
    </section>
  </div>
</template>
