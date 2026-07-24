<script setup lang="ts">
import AppIcon from "./AppIcon.vue";
import logoUrl from "../assets/logo.png";

const navigation = [
  { to: "/", label: "翻译", hint: "Translate", icon: "translate" as const },
  { to: "/naming", label: "命名", hint: "Naming", icon: "sparkle" as const },
  { to: "/history", label: "历史", hint: "History", icon: "history" as const },
  { to: "/settings", label: "设置", hint: "Settings", icon: "settings" as const },
  { to: "/about", label: "关于", hint: "About", icon: "info" as const }
];
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <img class="brand-mark" :src="logoUrl" alt="LexiFlow" width="44" height="44" />
      <div><strong>LexiFlow</strong><small>安静地读懂每一句</small></div>
    </div>
    <nav aria-label="主导航">
      <RouterLink v-for="item in navigation" :key="item.to" :to="item.to">
        <span class="nav-icon"><AppIcon :name="item.icon" :size="19" /></span>
        <span><strong>{{ item.label }}</strong><small>{{ item.hint }}</small></span>
        <AppIcon class="nav-chevron" name="chevron" :size="15" />
      </RouterLink>
    </nav>
    <div class="privacy-note">
      <span class="privacy-dot" />
      <div><strong>本地优先</strong><small>文本由你选择的模型处理</small></div>
    </div>
  </aside>
</template>
