<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import type { OcrBlock, OcrResult } from "../../../../electron/shared/types";

defineProps<{
  result?: OcrResult;
  error: string;
  loading: boolean;
  selectionStyle?: Record<string, string>;
  selecting: boolean;
  editedText: string;
}>();

const emit = defineEmits<{
  (event: "retry"): void;
  (event: "copy"): void;
  (event: "close"): void;
  (event: "begin-selection", value: PointerEvent): void;
  (event: "move-selection", value: PointerEvent): void;
  (event: "end-selection", value: PointerEvent): void;
  (event: "cancel-selection"): void;
  (event: "use-block", value: string): void;
  (event: "update:edited-text", value: string): void;
  (event: "apply"): void;
  (event: "image-ref", value: HTMLElement | undefined): void;
}>();

const imageElement = ref<HTMLElement>();

function setImageRef(): void {
  emit("image-ref", imageElement.value);
}

function useBlock(block: OcrBlock): void {
  emit("use-block", block.text);
}

onMounted(setImageRef);
onBeforeUnmount(() => emit("image-ref", undefined));
</script>

<template>
  <section v-if="result || error" class="ocr-card surface">
    <div class="panel-toolbar">
      <span>OCR 结果</span>
      <div>
        <button v-if="result" class="text-button" :disabled="loading" @click="emit('retry')">重新识别</button>
        <button v-if="result" class="text-button" @click="emit('copy')">复制原文</button>
        <button v-if="result" class="text-button" @click="emit('close')">关闭</button>
      </div>
    </div>
    <div v-if="error" class="error-message">{{ error }}</div>
    <div v-else-if="result" class="ocr-preview">
      <p>截图仅保存在主进程短期缓存。请在预览中框选需要识别的区域，系统只会对选区执行 OCR；取消或完成后会清理缓存与临时文件。</p>
      <div
        ref="imageElement"
        class="ocr-image"
        :class="{ selecting }"
        @pointerdown="emit('begin-selection', $event)"
        @pointermove="emit('move-selection', $event)"
        @pointerup="emit('end-selection', $event)"
        @pointercancel="emit('cancel-selection')"
      >
        <img :src="result.imageDataUrl" alt="OCR 截图预览" draggable="false" />
        <span v-if="selectionStyle" class="ocr-selection" :style="selectionStyle" />
        <button
          v-for="block in result.blocks"
          :key="block.id"
          class="ocr-block"
          :style="{ left: `${block.boundingBox.x / result.imageWidth * 100}%`, top: `${block.boundingBox.y / result.imageHeight * 100}%`, width: `${block.boundingBox.width / result.imageWidth * 100}%`, height: `${block.boundingBox.height / result.imageHeight * 100}%` }"
          :title="block.text"
          @pointerdown.stop
          @click.stop="useBlock(block)"
        />
      </div>
      <label class="wide-field">识别文本（可编辑）<textarea :value="editedText" rows="4" @input="emit('update:edited-text', ($event.target as HTMLTextAreaElement).value)" /></label>
      <div class="form-actions"><button class="secondary-button" @click="emit('apply')">用编辑后的文本翻译</button></div>
    </div>
  </section>
</template>
