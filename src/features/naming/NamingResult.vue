<script setup lang="ts">
import AppIcon from "../../components/AppIcon.vue";
import type { NamingResult } from "../../../electron/shared/types";

defineProps<{ result: NamingResult }>();
const emit = defineEmits<{ copy: [name: string]; regenerate: [] }>();
</script>

<template>
  <section class="naming-results">
    <button
      v-for="candidate in result.candidates"
      :key="candidate.name"
      type="button"
      :class="{ recommended: candidate.name === result.recommended }"
      @click="emit('copy', candidate.name)"
    >
      <code>{{ candidate.name }}</code>
      <span>{{ candidate.meaning }}</span>
      <AppIcon name="copy" :size="14" />
    </button>
    <footer>
      <span>已生成 {{ result.candidates.length }} 个命名建议</span>
      <button type="button" class="regen" @click="emit('regenerate')">重新生成</button>
    </footer>
  </section>
</template>

<style scoped>
.naming-results { display: grid; gap: 0; margin-top: 4px; }
.naming-results > button {
  display: grid; grid-template-columns: minmax(140px, .9fr) 1fr auto; align-items: center; gap: 12px;
  border: 0; border-bottom: 1px solid var(--border); padding: 12px 4px; text-align: left;
  color: var(--ink); background: transparent; cursor: pointer;
}
.naming-results > button:hover { background: var(--accent-soft); }
.naming-results > button.recommended code { color: var(--accent-strong); font-weight: 650; }
.naming-results span { color: var(--muted); font-size: 13px; }
footer {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 12px 4px 0; color: var(--muted); font-size: 12px;
}
.regen {
  border: 1px solid var(--border); border-radius: 7px; padding: 6px 10px;
  color: var(--ink-soft); background: var(--surface); font-size: 12px; cursor: pointer;
}
.regen:hover { background: var(--surface-soft); }
</style>
