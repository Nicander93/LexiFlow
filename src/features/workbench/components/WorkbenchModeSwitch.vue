<script setup lang="ts">
import UiSelect from "../../../components/UiSelect.vue";

defineProps<{ mode: "normal" | "naming" }>();
const emit = defineEmits<{ change: [mode: "normal" | "naming"] }>();
const modes = [{ value: "normal", label: "翻译" }, { value: "naming", label: "代码命名" }];
</script>

<template>
  <UiSelect class="mode-switch" :model-value="mode" :options="modes" label="工作台模式"
    @update:model-value="emit('change', $event === 'naming' ? 'naming' : 'normal')" />
</template>

<style scoped>
.mode-switch { width: 102px; }
.mode-switch :deep(.ui-select__trigger) { min-height: 28px; padding: 3px 9px; font-size: 13px; }
</style>
