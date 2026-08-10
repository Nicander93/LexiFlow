<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{ mode: "normal" | "naming" }>();
const emit = defineEmits<{ change: [mode: "normal" | "naming"] }>();
const open = ref(false);

function select(mode: "normal" | "naming"): void {
  open.value = false;
  if (mode !== props.mode) emit("change", mode);
}
</script>

<template>
  <div class="mode-switch">
    <button class="mode-switch-trigger" type="button" :aria-expanded="open" aria-haspopup="listbox" @click="open = !open">
      <span>{{ mode === "naming" ? "代码命名" : "翻译" }}</span>
      <i aria-hidden="true">▾</i>
    </button>
    <ul v-if="open" class="mode-switch-menu" role="listbox">
      <li>
        <button type="button" role="option" :aria-selected="mode === 'normal'" @click="select('normal')">
          <span v-if="mode === 'normal'" aria-hidden="true">✓</span>
          <span v-else class="spacer" aria-hidden="true" />
          翻译
        </button>
      </li>
      <li>
        <button type="button" role="option" :aria-selected="mode === 'naming'" @click="select('naming')">
          <span v-if="mode === 'naming'" aria-hidden="true">✓</span>
          <span v-else class="spacer" aria-hidden="true" />
          代码命名
        </button>
      </li>
    </ul>
    <button v-if="open" class="mode-switch-backdrop" type="button" aria-label="关闭模式菜单" @click="open = false" />
  </div>
</template>

<style scoped>
.mode-switch { position: relative; -webkit-app-region: no-drag; }
.mode-switch-backdrop {
  position: fixed; inset: 0; z-index: 29; border: 0; padding: 0;
  background: transparent; cursor: default;
}
.mode-switch-trigger {
  min-height: 28px; display: inline-flex; align-items: center; gap: 4px;
  padding: 0 8px; border: 1px solid var(--border); border-radius: 7px;
  color: var(--ink); background: var(--surface-soft); font-size: 13px; cursor: pointer;
}
.mode-switch-trigger:hover { background: var(--surface-hover); }
.mode-switch-trigger i { color: var(--muted); font-style: normal; font-size: 11px; }
.mode-switch-menu {
  position: absolute; left: 0; top: calc(100% + 4px); z-index: 30;
  min-width: 128px; margin: 0; padding: 4px; list-style: none;
  border: 1px solid var(--border); border-radius: 8px; background: var(--surface);
  box-shadow: var(--shadow-float);
}
.mode-switch-menu button {
  width: 100%; display: flex; align-items: center; gap: 6px;
  border: 0; border-radius: 5px; padding: 8px 9px; text-align: left;
  color: var(--ink-soft); background: none; font-size: 13px; cursor: pointer;
}
.mode-switch-menu button:hover, .mode-switch-menu button[aria-selected="true"] { color: var(--ink); background: var(--accent-soft); }
.spacer { width: 12px; display: inline-block; }
</style>
