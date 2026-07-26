<script setup lang="ts">
import PageHeader from "../components/PageHeader.vue";
import AppIcon from "../components/AppIcon.vue";
import logoUrl from "../assets/logo.png";
</script>

<template>
  <div class="page">
    <PageHeader title="关于" />
    <section class="about-hero surface">
      <div class="about-top"><img class="about-logo" :src="logoUrl" alt="LexiFlow" width="70" height="70" /><div><h2>LexiFlow 0.1.0</h2><p>为技术阅读和编程命名而做，支持 Ollama 与 OpenAI-compatible 模型服务。</p></div></div>
      <div class="about-features">
        <article class="about-feature"><AppIcon name="shield" /><strong>数据留在手边</strong><span>历史默认只保存在本机，远程 API Key 使用系统安全存储。</span></article>
        <article class="about-feature"><AppIcon name="translate" /><strong>边生成，边阅读</strong><span>流式展示结果，并且可以在任何时候取消当前请求。</span></article>
        <article class="about-feature"><AppIcon name="keyboard" /><strong>少一步打断</strong><span>通过全局快捷键获取选中文字，在鼠标附近快速查看。</span></article>
      </div>
      <p class="about-footnote">全局快捷键与划词能力目前仅在 Windows 上生效。</p>
    </section>
  </div>
</template>
