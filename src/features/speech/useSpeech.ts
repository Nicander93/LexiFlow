import { computed, onUnmounted, shallowRef } from "vue";
import { speechController } from "../../../electron/shared/speech";

export function useSpeech() {
  const owner = Symbol("speech-owner");
  const snapshot = shallowRef(speechController.getSnapshot());
  const unsubscribe = speechController.subscribe((value) => { snapshot.value = value; });
  const isSpeaking = computed(() => snapshot.value.status === "speaking" && snapshot.value.owner === owner);
  const error = computed(() => snapshot.value.owner === owner ? snapshot.value.error ?? "" : "");

  onUnmounted(() => {
    speechController.stop(owner);
    unsubscribe();
  });

  return {
    snapshot,
    isSpeaking,
    error,
    canSpeak: (language?: string) => speechController.canSpeak(language),
    toggle: (text: string, language?: string) => speechController.toggle(text, language, owner),
    stop: () => speechController.stop(owner)
  };
}
