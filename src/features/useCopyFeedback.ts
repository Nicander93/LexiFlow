import { onUnmounted, ref } from "vue";

export function useCopyFeedback(durationMs = 1_200) {
  const copied = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  function markCopied(): void {
    copied.value = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      copied.value = false;
      timer = undefined;
    }, durationMs);
  }
  function resetCopied(): void {
    copied.value = false;
    if (timer) clearTimeout(timer);
    timer = undefined;
  }
  onUnmounted(resetCopied);
  return { copied, markCopied, resetCopied };
}
