import { onUnmounted, ref, watch, type ComputedRef, type Ref } from "vue";
import type { SegmentAlternative, SegmentAlternativeEvent, SegmentRevision, SegmentRevisionEvent, TargetLanguage, TranslationSegment } from "../../../electron/shared/types";
import { toIpcPayload } from "../../../electron/shared/serialization";
import { getTranslatorApi } from "../../platform/translator";

export function useSegmentRevision(options: {
  lockedSegment: ComputedRef<TranslationSegment | undefined>;
  lockedSegmentId: Ref<string | undefined>;
  historyId: Ref<string | undefined>;
  targetLanguage: Ref<TargetLanguage>;
  profileId: Ref<string>;
  displayResultText: ComputedRef<string>;
}) {
  const translator = getTranslatorApi();
  const revisions = ref<SegmentRevision[]>([]);
  const pendingRevision = ref<SegmentRevision>();
  const revisionStatus = ref<"idle" | "loading" | "error">("idle");
  const revisionError = ref("");
  const revisionNotice = ref("");
  const customRevisionInstruction = ref("");
  const alternatives = ref<SegmentAlternative[]>([]);
  const alternativesLoading = ref(false);
  const lastInstruction = ref("");
  let revisionRequestId: string | undefined;
  let alternativesRequestId: string | undefined;
  let revisionAttempt = 0;
  let alternativesAttempt = 0;
  let earlyRevisionEvents: SegmentRevisionEvent[] | undefined;
  let earlyAlternativeEvents: SegmentAlternativeEvent[] | undefined;

  async function persistRevisions(): Promise<void> {
    if (!options.historyId.value) return;
    try {
      await translator.history.updateRevisions(toIpcPayload({
        id: options.historyId.value,
        revisions: revisions.value,
        resultText: options.displayResultText.value
      }));
      if (revisionError.value.includes("历史保存失败")) revisionError.value = "";
    } catch {
      revisionError.value = "当前修改已生效，但历史保存失败。请稍后重试保存。";
    }
  }

  function discardSuggestion(): void {
    revisionAttempt += 1;
    alternativesAttempt += 1;
    if (revisionRequestId) translator.revision.cancel(revisionRequestId);
    if (alternativesRequestId) translator.alternatives.cancel(alternativesRequestId);
    revisionRequestId = undefined;
    alternativesRequestId = undefined;
    earlyRevisionEvents = undefined;
    earlyAlternativeEvents = undefined;
    pendingRevision.value = undefined;
    alternatives.value = [];
    revisionStatus.value = "idle";
    alternativesLoading.value = false;
    revisionError.value = "";
  }

  async function reviseSegment(instruction: string): Promise<void> {
    const segment = options.lockedSegment.value;
    if (!segment || revisionStatus.value === "loading") return;
    discardSuggestion();
    const attempt = revisionAttempt;
    lastInstruction.value = instruction;
    revisionStatus.value = "loading";
    revisionNotice.value = "";
    earlyRevisionEvents = [];
    try {
      const id = await translator.revision.start(toIpcPayload({
        segment, instruction, targetLanguage: options.targetLanguage.value, profileId: options.profileId.value
      }));
      if (attempt !== revisionAttempt) {
        translator.revision.cancel(id);
        return;
      }
      revisionRequestId = id;
      const events = earlyRevisionEvents ?? [];
      earlyRevisionEvents = undefined;
      events.forEach(handleRevisionEvent);
    } catch (error) {
      if (attempt !== revisionAttempt) return;
      earlyRevisionEvents = undefined;
      revisionStatus.value = "error";
      revisionError.value = error instanceof Error ? error.message : "局部重译启动失败，请重试。";
    }
  }

  async function reviseWithCustomInstruction(): Promise<void> {
    const instruction = customRevisionInstruction.value.trim();
    if (!instruction) {
      revisionError.value = "请输入自定义要求或指定词语。";
      return;
    }
    await reviseSegment(instruction);
  }

  function applyRevision(): void {
    const suggestion = pendingRevision.value;
    const segment = options.lockedSegment.value;
    if (!suggestion || !segment || suggestion.segmentId !== segment.id || suggestion.previousTarget !== segment.target) return;
    revisions.value.push(suggestion);
    discardSuggestion();
    revisionNotice.value = "已替换这句，可撤销本句修改。";
    void persistRevisions();
  }

  function undoRevision(): void {
    const segmentId = options.lockedSegmentId.value;
    if (!segmentId) return;
    const index = revisions.value.map((item) => item.segmentId).lastIndexOf(segmentId);
    if (index < 0) return;
    discardSuggestion();
    revisions.value.splice(index, 1);
    revisionNotice.value = "已撤销本句修改。";
    void persistRevisions();
  }

  async function requestAlternatives(): Promise<void> {
    const segment = options.lockedSegment.value;
    if (!segment || alternativesLoading.value || revisionStatus.value === "loading") return;
    discardSuggestion();
    const attempt = alternativesAttempt;
    alternativesLoading.value = true;
    earlyAlternativeEvents = [];
    try {
      const id = await translator.alternatives.start(toIpcPayload({
        segment, targetLanguage: options.targetLanguage.value, profileId: options.profileId.value
      }));
      if (attempt !== alternativesAttempt) {
        translator.alternatives.cancel(id);
        return;
      }
      alternativesRequestId = id;
      const events = earlyAlternativeEvents ?? [];
      earlyAlternativeEvents = undefined;
      events.forEach(handleAlternativeEvent);
    } catch (error) {
      if (attempt !== alternativesAttempt) return;
      earlyAlternativeEvents = undefined;
      alternativesLoading.value = false;
      revisionError.value = error instanceof Error ? error.message : "候选译法生成失败，请重试。";
    }
  }

  function applyAlternative(alternative: SegmentAlternative): void {
    const segment = options.lockedSegment.value;
    if (!segment || revisionStatus.value === "loading") return;
    pendingRevision.value = {
      id: alternative.id, segmentId: segment.id, previousTarget: segment.target,
      newTarget: alternative.target, instruction: alternative.label, createdAt: Date.now()
    };
    lastInstruction.value = alternative.label;
  }

  function clearRevisions(): void {
    discardSuggestion();
    revisions.value = [];
    revisionNotice.value = "";
    customRevisionInstruction.value = "";
  }

  function handleRevisionEvent(event: SegmentRevisionEvent): void {
    if (!revisionRequestId || event.requestId !== revisionRequestId) return;
    if (event.status === "success" && event.revision) {
      if (event.revision.segmentId === options.lockedSegmentId.value) pendingRevision.value = event.revision;
      revisionStatus.value = "idle";
      revisionRequestId = undefined;
    } else if (event.status === "error" || event.status === "cancelled") {
      revisionStatus.value = "error";
      revisionError.value = event.error ?? "局部重译失败，请重试。";
      revisionRequestId = undefined;
    }
  }

  function handleAlternativeEvent(event: SegmentAlternativeEvent): void {
    if (!alternativesRequestId || event.requestId !== alternativesRequestId) return;
    if (event.status === "success" || event.status === "error" || event.status === "cancelled") {
      alternatives.value = event.alternatives ?? [];
      alternativesLoading.value = false;
      alternativesRequestId = undefined;
      if (event.status !== "success") revisionError.value = event.error ?? "候选译法生成失败，请重试。";
    }
  }

  // IPC can emit loading or cached results before its start response arrives.
  const removeRevisionListener = translator.revision.onEvent((event) => {
    if (earlyRevisionEvents) earlyRevisionEvents.push(event);
    else handleRevisionEvent(event);
  });
  const removeAlternativesListener = translator.alternatives.onEvent((event) => {
    if (earlyAlternativeEvents) earlyAlternativeEvents.push(event);
    else handleAlternativeEvent(event);
  });
  watch(options.lockedSegmentId, () => {
    discardSuggestion();
    customRevisionInstruction.value = "";
    revisionNotice.value = "";
  }, { flush: "sync" });
  onUnmounted(() => {
    discardSuggestion();
    removeRevisionListener();
    removeAlternativesListener();
  });

  return {
    revisions, pendingRevision, revisionStatus, revisionError, revisionNotice, customRevisionInstruction,
    alternatives, alternativesLoading, lastInstruction, reviseSegment, reviseWithCustomInstruction,
    applyRevision, discardSuggestion, undoRevision, requestAlternatives, applyAlternative, clearRevisions, persistRevisions
  };
}
