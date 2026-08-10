<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { getTranslatorApi } from "../platform/translator";
import selectionMarkUrl from "../assets/selection-mark.svg";

const translator = getTranslatorApi();

function translateSelection(): void {
  translator.selection.triggerTip();
}

function dismiss(): void {
  translator.selection.dismissTip();
}

onMounted(() => document.body.classList.add("selection-tip-body"));
onUnmounted(() => document.body.classList.remove("selection-tip-body"));
</script>

<template>
  <button class="selection-tip" title="翻译选中文字" aria-label="翻译选中文字" @click="translateSelection" @contextmenu.prevent="dismiss">
    <img :src="selectionMarkUrl" alt="" />
  </button>
</template>
