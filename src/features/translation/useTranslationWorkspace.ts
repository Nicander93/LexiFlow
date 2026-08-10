import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import type { DictionaryLookupResult, NamingOptions, TargetLanguage, TranslationMode, TranslationProfile, TranslationSegment } from "../../../electron/shared/types";
import { shouldLookupDictionary } from "../../../electron/shared/dictionary-eligibility";
import { useCopyFeedback } from "../useCopyFeedback";
import { useDictionary } from "../dictionary/useDictionary";
import { useOcrCapture } from "../ocr/useOcrCapture";
import { useWorkbenchUi } from "../workbench/useWorkbenchUi";
import { useSegmentRevision } from "./useSegmentRevision";
import { useTranslation } from "./useTranslation";
import { getTranslatorApi } from "../../platform/translator";

type ResultView = "dictionary" | "translation";

/** Page-level workflow coordinator; the page itself remains a layout/composition shell. */
export function useTranslationWorkspace() {
  const sourceText = ref("");
  const { workbenchMode, setMode: setWorkbenchMode } = useWorkbenchUi();
  const mode = ref<TranslationMode>("normal");
  const namingOptions = ref<NamingOptions>({ type: "variable", style: "camelCase", language: "general" });
  const targetLanguage = ref<TargetLanguage>("zh-CN");
  const { copied, markCopied } = useCopyFeedback();
  const translator = getTranslatorApi();
  let ocrTranslatePending = false;
  const maxInputLength = ref(10_000);
  const providerLabel = ref("本地模型");
  const profiles = ref<TranslationProfile[]>([]);
  const profileId = ref("general");
  const PROFILE_SHORTCUTS = [
    { id: "general", label: "通用" },
    { id: "technical", label: "技术" },
    { id: "academic", label: "学术" }
  ] as const;

  function selectProfileShortcut(id: string): void {
    profileId.value = id;
    mode.value = id === "technical" || id === "code-comment" ? "technical" : "normal";
  }

  function onProfileChange(): void {
    mode.value = profileId.value === "technical" || profileId.value === "code-comment" ? "technical" : "normal";
  }

  const { status, resultText, result, errorMessage, warningMessage, historyId, isRunning, start, stop, retry, reset } = useTranslation();
  const showOriginalText = ref(false);
  const cleanupDismissed = ref(false);
  const cleanupNotice = computed(() => {
    if (cleanupDismissed.value || !result.value?.cleanupActions?.length) return "";
    return result.value.cleanupActions.find((item) => item.type === "remove-soft-wraps")?.description
      ?? result.value.cleanupActions[0]?.description
      ?? "已自动整理原文";
  });
  const { status: dictionaryStatus, result: autoDictionaryResult, lookup: lookupAutoDictionary, reset: resetAutoDictionary } = useDictionary(220);
  const resultView = ref<ResultView>("translation");
  const lastTranslatedSource = ref("");
  const hoveredSegmentId = ref<string>();
  const lockedSegmentId = ref<string>();
  const sourceTextarea = ref<HTMLTextAreaElement>();
  const segmentDictionary = ref<DictionaryLookupResult | null>(null);
  const dictionaryTerm = ref("");
  const dictionaryLoading = ref(false);
  const dictionaryError = ref("");
  const dictionarySegmentId = ref<string>();
  const dictionaryCard = ref<HTMLElement>();
  const dictionaryContextText = ref("");
  const dictionaryContextError = ref("");
  const dictionaryContextLoading = ref(false);
  const dictionaryContextRequestId = ref<string>();
  const glossaryFromDictionary = ref({ sourceTerm: "", targetTerm: "" });
  const glossaryFromDictionaryNotice = ref("");

  const displaySegments = computed<TranslationSegment[]>(() => (result.value?.segments ?? []).map((segment) => {
    const revision = [...revisions.value].reverse().find((item) => item.segmentId === segment.id);
    return revision ? { ...segment, target: revision.newTarget } : segment;
  }));
  const displayResultText = computed(() => displaySegments.value.length ? displaySegments.value.map((segment) => segment.target).join("\n") : resultText.value);
  const lockedSegment = computed(() => displaySegments.value.find((segment) => segment.id === lockedSegmentId.value));

  const {
    revisions,
    revisionStatus,
    revisionError,
    revisionNotice,
    customRevisionInstruction,
    alternatives,
    alternativesLoading,
    reviseSegment,
    reviseWithCustomInstruction,
    undoRevision,
    requestAlternatives,
    applyAlternative,
    clearRevisions
  } = useSegmentRevision({ lockedSegment, lockedSegmentId, historyId, targetLanguage, profileId, displayResultText });

  const {
    ocrResult,
    ocrLoading,
    ocrError,
    ocrImage,
    ocrSelectionStyle,
    selectingOcr,
    captureOcr,
    beginOcrSelection,
    moveOcrSelection,
    endOcrSelection,
    cancelOcrSelection,
    setOcrImage,
    resetOcr
  } = useOcrCapture({
    sourceText,
    onRecognized: (text) => {
      if (!text.trim() || ocrTranslatePending) return;
      ocrTranslatePending = true;
      sourceText.value = text;
      resetOcr();
      void triggerAiTranslate().finally(() => { ocrTranslatePending = false; });
    }
  });

  const activeSegmentId = computed(() => lockedSegmentId.value ?? hoveredSegmentId.value);
  const hasStructuredResult = computed(() => Boolean(result.value?.segments.length) && (status.value === "success" || status.value === "streaming"));
  const dictionaryContext = computed(() => displaySegments.value.find((segment) => segment.id === dictionarySegmentId.value));
  const glossaryValidation = computed(() => result.value?.glossaryValidation ?? []);
  const dictionaryEligible = computed(() => shouldLookupDictionary(sourceText.value));
  const showDictionaryPane = computed(() => dictionaryEligible.value && dictionaryStatus.value === "found" && Boolean(autoDictionaryResult.value?.entry));
  const showDictionaryTab = computed(() => dictionaryEligible.value);
  const showRevisionPopover = computed(() => Boolean(lockedSegment.value && hasStructuredResult.value));
  const showMainDictionary = computed(() => showDictionaryPane.value && resultView.value === "dictionary");
  const dictionarySuggestions = computed(() => autoDictionaryResult.value?.suggestions ?? []);

  function resizeSourceTextarea(): void {
    const el = sourceTextarea.value;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }

  watch(sourceText, (value) => {
    if (lastTranslatedSource.value && value !== lastTranslatedSource.value) {
      reset();
      lastTranslatedSource.value = "";
      closeDictionary();
    }
    void nextTick(resizeSourceTextarea);
    if (!shouldLookupDictionary(value)) {
      resetAutoDictionary();
      resultView.value = "translation";
      return;
    }
    lookupAutoDictionary(value);
  });

  watch(dictionaryStatus, (value) => {
    if (!dictionaryEligible.value) {
      resultView.value = "translation";
      return;
    }
    if (value === "found") resultView.value = "dictionary";
    else if (resultView.value === "dictionary") resultView.value = "translation";
  });

  watch(mode, (value) => {
    setWorkbenchMode(value === "naming" ? "naming" : "normal");
  }, { immediate: true });

  watch(workbenchMode, (value) => {
    if (value === "naming" && mode.value !== "naming") {
      mode.value = "naming";
      profileId.value = "general";
    } else if (value === "normal" && mode.value === "naming") {
      mode.value = "normal";
    }
  });

  watch(result, (value) => {
    if (!value?.sourceText) return;
    lastTranslatedSource.value = value.sourceText;
    if (value.sourceText !== sourceText.value) sourceText.value = value.sourceText;
  });

  function undoCleanupAndRetranslate(): void {
    const original = result.value?.originalSourceText;
    if (!original) return;
    sourceText.value = original;
    cleanupDismissed.value = true;
    void translate();
  }

  async function translate(): Promise<void> {
    hoveredSegmentId.value = undefined;
    lockedSegmentId.value = undefined;
    clearRevisions();
    cleanupDismissed.value = false;
    showOriginalText.value = false;
    closeDictionary();
    resultView.value = "translation";
    lastTranslatedSource.value = sourceText.value;
    await start({ text: sourceText.value, mode: mode.value, targetLanguage: mode.value === "naming" ? "en" : targetLanguage.value, profileId: profileId.value, namingOptions: mode.value === "naming" ? namingOptions.value : undefined, surface: "main" });
  }

  async function triggerAiTranslate(): Promise<void> {
    resultView.value = "translation";
    if (lastTranslatedSource.value === sourceText.value && (status.value === "success" || status.value === "streaming" || status.value === "loading")) return;
    await translate();
  }

  async function switchResultView(view: ResultView): Promise<void> {
    if (view === "dictionary") {
      if (showDictionaryPane.value) resultView.value = "dictionary";
      return;
    }
    await triggerAiTranslate();
  }

  async function addActiveSegmentToGlossary(): Promise<void> {
    const segment = lockedSegment.value;
    if (!segment) return;
    try {
      const now = Date.now();
      await translator.glossary.upsert({ id: crypto.randomUUID(), sourceTerm: segment.source, targetTerm: segment.target, sourceLanguage: "auto", targetLanguage: result.value?.targetLanguage ?? targetLanguage.value, domain: "翻译结果", caseSensitive: false, matchMode: "phrase", enabled: true, createdAt: now, updatedAt: now });
      revisionError.value = "";
      revisionNotice.value = "已将当前句段加入本地术语表。";
    } catch (error) {
      revisionNotice.value = "";
      revisionError.value = error instanceof Error ? error.message : "加入术语表失败。";
    }
  }

  async function addDictionaryTermToGlossary(): Promise<void> {
    const sourceTerm = glossaryFromDictionary.value.sourceTerm.trim() || dictionaryTerm.value;
    const targetTerm = glossaryFromDictionary.value.targetTerm.trim();
    if (!sourceTerm || !targetTerm) {
      glossaryFromDictionaryNotice.value = "请确认源词和目标词后再加入术语表。";
      return;
    }
    try {
      const now = Date.now();
      await translator.glossary.upsert({ id: crypto.randomUUID(), sourceTerm, targetTerm, sourceLanguage: "auto", targetLanguage: result.value?.targetLanguage ?? targetLanguage.value, domain: "词典", caseSensitive: false, matchMode: "word", enabled: true, createdAt: now, updatedAt: now });
      glossaryFromDictionaryNotice.value = "已加入本地术语表。";
    } catch (error) {
      glossaryFromDictionaryNotice.value = error instanceof Error ? error.message : "加入术语表失败。";
    }
  }

  function closeOcr(): void { resetOcr(); }
  function handleSegmentHover(id: string | undefined): void { if (!lockedSegmentId.value) hoveredSegmentId.value = id; }
  function toggleSegment(id: string): void { lockedSegmentId.value = lockedSegmentId.value === id ? undefined : id; hoveredSegmentId.value = undefined; }
  function clearSegmentLock(): void { lockedSegmentId.value = undefined; hoveredSegmentId.value = undefined; }
  function navigateSegment(id: string): void { lockedSegmentId.value = id; hoveredSegmentId.value = undefined; }

  function closeDictionary(): void {
    translator.dictionary.context.cancel(dictionaryContextRequestId.value);
    dictionaryTerm.value = "";
    segmentDictionary.value = null;
    dictionaryError.value = "";
    dictionarySegmentId.value = undefined;
    dictionaryContextText.value = "";
    dictionaryContextError.value = "";
    dictionaryContextLoading.value = false;
    dictionaryContextRequestId.value = undefined;
  }

  async function lookupDictionary(term: string, segmentId?: string): Promise<void> {
    translator.dictionary.context.cancel(dictionaryContextRequestId.value);
    dictionaryTerm.value = term;
    dictionarySegmentId.value = segmentId;
    segmentDictionary.value = null;
    dictionaryError.value = "";
    dictionaryContextText.value = "";
    dictionaryContextError.value = "";
    dictionaryContextLoading.value = false;
    dictionaryContextRequestId.value = undefined;
    if (segmentId) {
      lockedSegmentId.value = segmentId;
      hoveredSegmentId.value = undefined;
    }
    dictionaryLoading.value = true;
    try {
      const lookup = await translator.dictionary.lookup({ query: term });
      segmentDictionary.value = lookup;
      const firstSense = lookup.entry?.senses[0]?.translations[0] ?? "";
      glossaryFromDictionary.value = { sourceTerm: term, targetTerm: firstSense.split(/[；;，,]/)[0]?.trim() ?? "" };
      glossaryFromDictionaryNotice.value = "";
      const profile = profiles.value.find((candidate) => candidate.id === profileId.value);
      const context = dictionaryContext.value;
      if (lookup.found && context && profile?.dictionaryMode === "contextual") {
        dictionaryContextLoading.value = true;
        dictionaryContextRequestId.value = await translator.dictionary.context.start({ term, source: context.source, target: context.target, targetLanguage: targetLanguage.value, profileId: profileId.value });
      }
    } catch (error) {
      dictionaryError.value = error instanceof Error ? error.message : "本地词典暂时不可用。";
    } finally {
      dictionaryLoading.value = false;
    }
  }

  async function copyResult(): Promise<void> { if (resultText.value) { await translator.clipboard.writeText(displayResultText.value); markCopied(); } }
  async function copySource(): Promise<void> { if (sourceText.value) { await translator.clipboard.writeText(sourceText.value); markCopied(); } }
  async function copyBilingual(): Promise<void> { if (sourceText.value && displayResultText.value) { await translator.clipboard.writeText(`原文：${sourceText.value}\n\n译文：${displayResultText.value}`); markCopied(); } }
  async function copyNamingCandidate(name: string): Promise<void> {
    if (!name.trim()) return;
    await translator.clipboard.writeText(name);
    markCopied();
  }

  onMounted(async () => {
    void nextTick(resizeSourceTextarea);
    const settings = await translator.settings.get();
    maxInputLength.value = settings.translation.maxInputLength;
    targetLanguage.value = settings.translation.targetLanguage;
    providerLabel.value = settings.provider.type === "ollama" ? "本地模型" : "远程模型";
    profiles.value = await translator.profiles.list();
    const quickSession = await translator.translation.getSession();
    if (quickSession && !sourceText.value) {
      sourceText.value = quickSession.sourceText;
      profileId.value = quickSession.profileId;
      targetLanguage.value = quickSession.targetLanguage;
      resultText.value = quickSession.resultText;
      if (quickSession.resultText || quickSession.segments.length) result.value = { requestId: quickSession.requestId ?? quickSession.id, sourceText: quickSession.sourceText, originalSourceText: quickSession.sourceText, targetText: quickSession.resultText, sourceLanguage: "", targetLanguage: quickSession.targetLanguage, segments: quickSession.segments, modelInfo: { provider: "ollama", model: "", durationMs: 0 }, createdAt: quickSession.createdAt };
      status.value = quickSession.status;
      lastTranslatedSource.value = quickSession.sourceText;
    }
  });

  const removeDictionaryContextListener = translator.dictionary.context.onEvent((event) => {
    if (dictionaryContextRequestId.value && event.requestId !== dictionaryContextRequestId.value) return;
    dictionaryContextLoading.value = event.status === "loading";
    if (event.status === "success") {
      dictionaryContextText.value = event.explanation ?? "";
      dictionaryContextLoading.value = false;
      dictionaryContextRequestId.value = undefined;
    }
    if (event.status === "error" || event.status === "cancelled") {
      dictionaryContextError.value = event.error ?? "上下文解释暂不可用。";
      dictionaryContextLoading.value = false;
      dictionaryContextRequestId.value = undefined;
    }
  });
  onUnmounted(() => {
    translator.dictionary.context.cancel(dictionaryContextRequestId.value);
    removeDictionaryContextListener();
  });

  return {
    PROFILE_SHORTCUTS, sourceText, mode, namingOptions, targetLanguage, profiles, profileId, providerLabel, selectProfileShortcut, onProfileChange,
    maxInputLength, showOriginalText, cleanupNotice, undoCleanupAndRetranslate, isRunning, triggerAiTranslate,
    resultView, showDictionaryTab, showMainDictionary, switchResultView, autoDictionaryResult, dictionaryStatus, dictionaryEligible, dictionarySuggestions,
    status, displayResultText, result, errorMessage, warningMessage, displaySegments, activeSegmentId, copied, copyResult, copySource, copyBilingual, copyNamingCandidate, stop, retry,
    handleSegmentHover, toggleSegment, clearSegmentLock, navigateSegment, lookupDictionary,
    ocrResult, ocrError, ocrLoading, captureOcr, closeOcr, ocrImage, ocrSelectionStyle, selectingOcr, beginOcrSelection, moveOcrSelection, endOcrSelection, cancelOcrSelection, setOcrImage,
    dictionaryTerm, dictionaryCard, dictionaryLoading, dictionaryError, segmentDictionary, closeDictionary, dictionaryContext, dictionaryContextLoading, dictionaryContextText, dictionaryContextError, glossaryFromDictionary, glossaryFromDictionaryNotice, addDictionaryTermToGlossary,
    showRevisionPopover, alternativesLoading, requestAlternatives, addActiveSegmentToGlossary, revisions, lockedSegment, undoRevision, customRevisionInstruction, revisionStatus, reviseSegment, reviseWithCustomInstruction, alternatives, applyAlternative, revisionError, revisionNotice,
    glossaryValidation, sourceTextarea, cleanupDismissed
  };
}
