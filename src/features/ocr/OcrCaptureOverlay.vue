<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { OcrResult } from "../../../electron/shared/types";

defineProps<{
  result?: OcrResult;
  error: string;
  loading: boolean;
  selectionStyle?: Record<string, string>;
  selecting: boolean;
}>();

const emit = defineEmits<{
  retry: [];
  close: [];
  "begin-selection": [value: PointerEvent];
  "move-selection": [value: PointerEvent];
  "end-selection": [value: PointerEvent];
  "cancel-selection": [];
  "image-ref": [value: HTMLElement | undefined];
}>();

const imageElement = ref<HTMLElement>();
watch(imageElement, (value) => emit("image-ref", value), { flush: "post" });
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  emit("cancel-selection");
  emit("close");
}
onMounted(() => {
  window.addEventListener("keydown", onKeydown);
});
onBeforeUnmount(() => {
  emit("image-ref", undefined);
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <div class="ocr-overlay" :class="{ 'ocr-overlay--capture': result }" @click.self="emit('close')">
    <section v-if="loading && !result" class="ocr-progress" role="status">
      <span class="spinner" />
      <div><strong>正在截取屏幕</strong><small>LexiFlow 会暂时隐藏，完成后即可框选文字</small></div>
    </section>

    <section v-else-if="result" class="ocr-canvas">
      <header class="ocr-toolbar">
        <div><strong>{{ loading ? "正在识别选区" : error ? "需要重新截图" : "拖动框选文字" }}</strong><small>{{ loading ? "识别完成后会自动回填并翻译" : error || "按 Esc 可取消" }}</small></div>
        <button type="button" aria-label="关闭 OCR" @click="emit('close')">×</button>
      </header>
      <div class="ocr-stage">
        <div
          ref="imageElement"
          class="ocr-image"
          :class="{ selecting, busy: loading }"
          @pointerdown="!loading && emit('begin-selection', $event)"
          @pointermove="!loading && emit('move-selection', $event)"
          @pointerup="!loading && emit('end-selection', $event)"
          @pointercancel="emit('cancel-selection')"
        >
          <img :src="result.imageDataUrl" alt="待框选的屏幕截图" draggable="false" />
          <span v-if="selectionStyle" class="ocr-selection" :style="selectionStyle" />
        </div>
      </div>
      <div v-if="loading" class="ocr-float-state" role="status"><span class="spinner" />正在识别…</div>
      <div v-else-if="error" class="ocr-float-state error" role="alert">
        <span>{{ error }}</span><button type="button" @click="emit('retry')">重新截图</button>
      </div>
    </section>

    <section v-else class="ocr-error-card" role="alert">
      <div><strong>无法开始 OCR</strong><small>{{ error }}</small></div>
      <button type="button" class="primary-button" @click="emit('retry')">重试</button>
      <button type="button" class="text-button" @click="emit('close')">取消</button>
    </section>
  </div>
</template>

<style scoped>
.ocr-overlay {
  position: fixed; inset: 42px 0 0; z-index: 25; display: grid; place-items: center;
  padding: 18px; background: rgba(45,51,43,.24); backdrop-filter: blur(3px);
}
.ocr-overlay--capture { padding: 14px 18px 18px; background: rgba(28,31,28,.82); backdrop-filter: blur(6px); }
.ocr-progress, .ocr-error-card {
  display: flex; align-items: center; gap: 13px; width: min(360px, 100%); min-height: 82px; padding: 16px 18px;
  border: 1px solid rgba(255,255,255,.76); border-radius: 12px; background: rgba(255,255,255,.96); box-shadow: var(--shadow-float);
}
.ocr-progress div, .ocr-error-card div { display: grid; gap: 3px; min-width: 0; }
.ocr-progress strong, .ocr-error-card strong { font-size: 13px; }
.ocr-progress small, .ocr-error-card small { color: var(--muted); font-size: 12px; line-height: 1.45; }
.ocr-error-card { flex-wrap: wrap; }
.ocr-error-card div { flex: 1 1 220px; }
.ocr-canvas { position: absolute; inset: 0; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.ocr-toolbar {
  min-height: 52px; display: flex; align-items: center; justify-content: space-between; gap: 16px;
  margin: 0 auto 8px; padding: 8px 9px 8px 14px; border: 1px solid rgba(255,255,255,.2); border-radius: 11px;
  color: white; background: rgba(25,28,25,.78); box-shadow: 0 8px 26px rgba(0,0,0,.2); backdrop-filter: blur(16px);
}
.ocr-toolbar div { display: flex; align-items: baseline; gap: 10px; }
.ocr-toolbar strong { font-size: 13px; }
.ocr-toolbar small { color: rgba(255,255,255,.67); font-size: 12px; }
.ocr-toolbar button {
  width: 28px; height: 28px; border: 0; border-radius: 6px; color: var(--muted); background: transparent; cursor: pointer;
}
.ocr-toolbar button { color: rgba(255,255,255,.72); }
.ocr-toolbar button:hover { color: white; background: rgba(255,255,255,.12); }
.ocr-stage { flex: 1; min-width: 0; min-height: 0; display: grid; place-items: center; overflow: hidden; }
.ocr-image {
  position: relative; display: inline-block; max-width: calc(100vw - 36px); max-height: calc(100dvh - 116px);
  overflow: hidden; border-radius: 8px; background: #111; box-shadow: 0 18px 52px rgba(0,0,0,.32);
  touch-action: none; cursor: crosshair;
}
.ocr-image.busy { cursor: wait; }
.ocr-image img { display: block; width: auto; height: auto; max-width: calc(100vw - 36px); max-height: calc(100dvh - 116px); object-fit: contain; opacity: .94; user-select: none; }
.ocr-selection {
  position: absolute; box-sizing: border-box; pointer-events: none;
  border: 2px solid #8fd19c; background: rgba(125,187,138,.15); box-shadow: 0 0 0 9999px rgba(17,20,17,.38);
}
.ocr-float-state {
  position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%); display: flex; align-items: center; gap: 9px;
  max-width: calc(100% - 32px); padding: 9px 12px; border: 1px solid rgba(255,255,255,.7); border-radius: 9px;
  color: var(--ink-soft); background: rgba(255,255,255,.96); box-shadow: var(--shadow-float); font-size: 12px;
}
.ocr-float-state.error { color: var(--danger); }
.ocr-float-state button { border: 0; border-radius: 6px; padding: 5px 8px; color: var(--accent-strong); background: var(--accent-soft); font-weight: 600; }
</style>
