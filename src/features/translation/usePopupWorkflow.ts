import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import type { NamingResult, TranslationMode, TranslationProfile } from "../../../electron/shared/types";
import { shouldLookupDictionary } from "../../../electron/shared/dictionary-eligibility";
import { getTranslatorApi } from "../../platform/translator";
import { useCopyFeedback } from "../useCopyFeedback";
import { useDictionary } from "../dictionary/useDictionary";
import { useTranslation } from "./useTranslation";

export type PopupView = "dictionary" | "normal" | "technical" | "naming";

/** Quick-translation popup workflow; window layout and rendering stay in PopupPage. */
export function usePopupWorkflow() {
  const mode = ref<TranslationMode>("technical");
  const popupView = ref<PopupView>("technical");
  const sourceText = ref("");
  const captureError = ref("");
  const capturing = ref(false);
  const pinned = ref(false);
  const profiles = ref<TranslationProfile[]>([]);
  const profileId = ref("technical");
  const defaultTranslationProfileId = ref("technical");
  const { copied, markCopied, resetCopied } = useCopyFeedback(1_000);
  const sourceExpanded = ref(true);
  const popupShell = ref<HTMLElement>();
  const translator = getTranslatorApi();
  const { status, resultText, result, errorMessage, warningMessage, isRunning, start, stop, retry, reset } = useTranslation();
  const { status: dictionaryStatus, result: dictionaryResult, lookupImmediate, reset: resetDictionary } = useDictionary(0);
  const hoveredSegmentId = ref<string>();
  const lockedSegmentId = ref<string>();
  let payloadSequence = 0;
  let lastAdaptedKey = "";

  function syncProfileForMode(nextMode: TranslationMode, preferredProfileId?: string): void {
    if (nextMode === "naming") return;
    if (preferredProfileId) {
      profileId.value = preferredProfileId;
      return;
    }
    profileId.value = nextMode === "technical" ? (defaultTranslationProfileId.value || "technical") : "general";
  }

  function adaptHeightForView(view: PopupView, force = false): void {
    const kind = view === "dictionary" ? "dictionary" : view === "naming" ? "naming" : status.value === "loading" || capturing.value ? "default" : "translation";
    const key = `${kind}:${view}:${status.value}:${capturing.value ? 1 : 0}`;
    if (!force && key === lastAdaptedKey) return;
    lastAdaptedKey = key;
    void nextTick(() => {
      const contentHeight = popupShell.value?.scrollHeight;
      translator.window.adaptPopupHeight(kind, contentHeight);
    });
  }

  const namingResult = computed<NamingResult | null>(() => {
    if (mode.value !== "naming" || status.value !== "success") return null;
    try { return JSON.parse(resultText.value) as NamingResult; } catch { return null; }
  });
  const displayResult = computed(() => namingResult.value?.recommended ?? resultText.value);
  const activeSegmentId = computed(() => lockedSegmentId.value ?? hoveredSegmentId.value);
  const hasStructuredResult = computed(() => status.value === "success" && Boolean(result.value?.segments.length));
  const showDictionaryTab = computed(() => dictionaryStatus.value === "found" && Boolean(dictionaryResult.value?.entry));

  async function run(): Promise<void> {
    if (!sourceText.value.trim()) return;
    hoveredSegmentId.value = undefined;
    lockedSegmentId.value = undefined;
    await start({
      text: sourceText.value,
      mode: mode.value,
      targetLanguage: mode.value === "naming" ? "en" : "auto",
      namingOptions: mode.value === "naming" ? { type: "variable", style: "camelCase", language: "general" } : undefined,
      profileId: profileId.value,
      surface: "popup"
    });
  }

  async function selectView(view: PopupView): Promise<void> {
    popupView.value = view;
    adaptHeightForView(view, true);
    if (view === "dictionary") return;
    mode.value = view;
    syncProfileForMode(view);
    await run();
  }

  async function triggerAiTranslate(): Promise<void> {
    popupView.value = mode.value === "naming" ? "naming" : mode.value;
    await run();
  }

  async function handlePayloadText(text: string, preferredMode: TranslationMode, sequence: number): Promise<void> {
    sourceText.value = text;
    if (!shouldLookupDictionary(text)) {
      resetDictionary();
      popupView.value = preferredMode;
      mode.value = preferredMode;
      adaptHeightForView(preferredMode, true);
      await run();
      return;
    }
    await lookupImmediate(text);
    if (sequence !== payloadSequence) return;
    if (dictionaryStatus.value === "found" && dictionaryResult.value?.entry) {
      popupView.value = "dictionary";
      adaptHeightForView("dictionary", true);
      return;
    }
    popupView.value = preferredMode;
    mode.value = preferredMode;
    adaptHeightForView(preferredMode, true);
    await run();
  }

  async function copy(text = displayResult.value): Promise<void> {
    if (!text) return;
    await translator.clipboard.writeText(text);
    markCopied();
  }

  function close(): void { stop(); translator.window.closePopup(); }
  function togglePin(): void { pinned.value = !pinned.value; translator.window.pinPopup(pinned.value); }
  function openMain(): void {
    translator.window.openMain(mode.value === "naming" ? "/?mode=naming" : "/");
  }
  function handleKeydown(event: KeyboardEvent): void { if (event.key === "Escape") close(); }

  function handleSegmentHover(id: string | undefined): void { if (!lockedSegmentId.value) hoveredSegmentId.value = id; }
  function toggleSegment(id: string): void { lockedSegmentId.value = lockedSegmentId.value === id ? undefined : id; hoveredSegmentId.value = undefined; }
  function clearSegmentLock(): void { lockedSegmentId.value = undefined; hoveredSegmentId.value = undefined; }
  function navigateSegment(id: string): void { lockedSegmentId.value = id; hoveredSegmentId.value = undefined; }

  let removePayloadListener: (() => void) | undefined;
  onMounted(() => {
    document.addEventListener("keydown", handleKeydown);
    void translator.settings.get().then((settings) => {
      defaultTranslationProfileId.value = settings.shortcuts.defaultTranslationProfileId || "technical";
      profileId.value = defaultTranslationProfileId.value;
    }).catch(() => undefined);
    void translator.profiles.list().then((items) => { profiles.value = items; }).catch(() => undefined);
    removePayloadListener = translator.window.onPopupPayload((payload) => {
      const sequence = ++payloadSequence;
      stop();
      reset();
      resetDictionary();
      resetCopied();
      mode.value = payload.mode;
      popupView.value = payload.mode;
      syncProfileForMode(payload.mode, payload.profileId);
      capturing.value = Boolean(payload.capturing);
      captureError.value = payload.error ?? "";
      hoveredSegmentId.value = undefined;
      lockedSegmentId.value = undefined;
      lastAdaptedKey = "";
      adaptHeightForView(popupView.value, true);
      if (payload.text) {
        capturing.value = false;
        void handlePayloadText(payload.text, payload.mode, sequence);
      }
    });
  });

  watch(status, (value) => {
    if (value === "success" || value === "error" || value === "loading") adaptHeightForView(popupView.value, true);
  });

  onUnmounted(() => {
    document.removeEventListener("keydown", handleKeydown);
    removePayloadListener?.();
  });

  return {
    mode, popupView, sourceText, captureError, capturing, pinned, profiles, profileId, copied, sourceExpanded, popupShell,
    status, resultText, result, errorMessage, warningMessage, isRunning, retry, displayResult, namingResult, activeSegmentId, hasStructuredResult, showDictionaryTab, dictionaryResult,
    run, selectView, triggerAiTranslate, copy, close, togglePin, openMain, handleSegmentHover, toggleSegment, clearSegmentLock, navigateSegment, stop
  };
}
