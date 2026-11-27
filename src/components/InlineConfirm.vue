<script setup lang="ts">
import { onMounted, ref } from "vue";

defineProps<{ message: string; action: string; busy?: boolean }>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();
const cancelButton = ref<HTMLButtonElement>();
onMounted(() => cancelButton.value?.focus({ preventScroll: true }));
</script>

<template>
  <div class="confirm-strip" role="group" :aria-label="message" @keydown.esc.stop="!busy && emit('cancel')">
    <span>{{ message }}</span>
    <div>
      <button ref="cancelButton" class="text-button" type="button" :disabled="busy" @click="emit('cancel')">返回</button>
      <button class="secondary-button danger" type="button" :disabled="busy" @click="emit('confirm')">{{ action }}</button>
    </div>
  </div>
</template>
