import { onUnmounted, ref, type ComputedRef, type Ref } from "vue";
import type { SegmentAlternative, SegmentRevision, TargetLanguage, TranslationSegment } from "../../electron/shared/types";
import { getTranslatorApi } from "../platform/translator";

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
  const revisionStatus = ref<"idle" | "loading" | "error">("idle");
  const revisionError = ref("");
  const revisionNotice = ref("");
  const customRevisionInstruction = ref("");
  const revisionRequestId = ref<string>();
  const alternatives = ref<SegmentAlternative[]>([]);
  const alternativesLoading = ref(false);
  const alternativesRequestId = ref<string>();

  async function persistRevisions(): Promise<void> {
    if (!options.historyId.value) return;
    try {
      await translator.history.updateRevisions({
        id: options.historyId.value,
        revisions: revisions.value,
        resultText: options.displayResultText.value
      });
    } catch {
      // 修订落盘失败不阻断当前编辑。
    }
  }

  async function reviseSegment(instruction: string): Promise<void> {
    const segment = options.lockedSegment.value;
    if (!segment || revisionStatus.value === "loading") return;
    revisionStatus.value = "loading";
    revisionError.value = "";
    revisionNotice.value = "";
    revisionRequestId.value = await translator.revision.start({
      segment,
      instruction,
      targetLanguage: options.targetLanguage.value,
      profileId: options.profileId.value
    });
  }

  async function reviseWithCustomInstruction(): Promise<void> {
    const instruction = customRevisionInstruction.value.trim();
    if (!instruction) {
      revisionError.value = "请输入自定义要求或指定词语。";
      return;
    }
    await reviseSegment(instruction);
  }

  function undoRevision(): void {
    const segmentId = options.lockedSegmentId.value;
    if (!segmentId) return;
    const index = [...revisions.value].map((item) => item.segmentId).lastIndexOf(segmentId);
    if (index >= 0) {
      revisions.value.splice(index, 1);
      void persistRevisions();
    }
  }

  async function requestAlternatives(): Promise<void> {
    if (!options.lockedSegment.value || alternativesLoading.value) return;
    alternatives.value = [];
    alternativesLoading.value = true;
    alternativesRequestId.value = await translator.alternatives.start({
      segment: options.lockedSegment.value,
      targetLanguage: options.targetLanguage.value,
      profileId: options.profileId.value
    });
  }

  function applyAlternative(alternative: SegmentAlternative): void {
    const segment = options.lockedSegment.value;
    if (!segment) return;
    revisions.value.push({
      id: alternative.id,
      segmentId: segment.id,
      previousTarget: segment.target,
      newTarget: alternative.target,
      instruction: alternative.label,
      createdAt: Date.now()
    });
    alternatives.value = [];
    void persistRevisions();
  }

  function clearRevisions(): void {
    revisions.value = [];
    alternatives.value = [];
  }

  const removeRevisionListener = translator.revision.onEvent((event) => {
    if (revisionRequestId.value && event.requestId !== revisionRequestId.value) return;
    if (event.status === "loading") revisionStatus.value = "loading";
    if (event.status === "success" && event.revision) {
      revisions.value.push(event.revision);
      revisionStatus.value = "idle";
      revisionRequestId.value = undefined;
      void persistRevisions();
    }
    if (event.status === "error" || event.status === "cancelled") {
      revisionStatus.value = "error";
      revisionError.value = event.error ?? "局部重译失败。";
      revisionRequestId.value = undefined;
    }
  });

  const removeAlternativesListener = translator.alternatives.onEvent((event) => {
    if (alternativesRequestId.value && event.requestId !== alternativesRequestId.value) return;
    if (event.status === "success" && event.alternatives) {
      alternatives.value = event.alternatives;
      alternativesLoading.value = false;
      alternativesRequestId.value = undefined;
    }
    if (event.status === "error" || event.status === "cancelled") {
      alternativesLoading.value = false;
      alternativesRequestId.value = undefined;
    }
  });

  onUnmounted(() => {
    translator.revision.cancel(revisionRequestId.value);
    translator.alternatives.cancel(alternativesRequestId.value);
    removeRevisionListener();
    removeAlternativesListener();
  });

  return {
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
    clearRevisions,
    persistRevisions
  };
}
