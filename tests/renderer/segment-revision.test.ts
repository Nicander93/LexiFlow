import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, ref } from "vue";
import type { SegmentAlternativeEvent, SegmentRevision, SegmentRevisionEvent, TranslationSegment } from "../../electron/shared/types";
import { useSegmentRevision } from "../../src/features/translation/useSegmentRevision";

const api = vi.hoisted(() => ({
  revision: { start: vi.fn(), cancel: vi.fn(), onEvent: vi.fn() },
  alternatives: { start: vi.fn(), cancel: vi.fn(), onEvent: vi.fn() },
  history: { updateRevisions: vi.fn() }
}));
const cleanups = vi.hoisted(() => [] as Array<() => void>);
vi.mock("../../src/platform/translator", () => ({ getTranslatorApi: () => api }));
vi.mock("vue", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue")>(), onUnmounted: (callback: () => void) => cleanups.push(callback)
}));

let revisionListener: (event: SegmentRevisionEvent) => void;
let alternativeListener: (event: SegmentAlternativeEvent) => void;
const scopes: ReturnType<typeof effectScope>[] = [];
const segment: TranslationSegment = { id: "sentence-1", source: "Original sentence.", target: "当前译文。", sourceStart: 0, sourceEnd: 18 };
const suggestion: SegmentRevision = { id: "revision-1", segmentId: segment.id, previousTarget: segment.target, newTarget: "建议译文。", instruction: "更自然", createdAt: 1 };

function createRevision() {
  const scope = effectScope();
  scopes.push(scope);
  return scope.run(() => {
    const lockedSegmentId = ref<string | undefined>(segment.id);
    const historyId = ref<string | undefined>("history-1");
    const revision = useSegmentRevision({
      lockedSegment: computed(() => lockedSegmentId.value ? segment : undefined), lockedSegmentId,
      historyId, targetLanguage: ref("zh-CN"), profileId: ref("general"), displayResultText: computed(() => "已应用的正文")
    });
    return { ...revision, lockedSegmentId };
  })!;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.revision.start.mockResolvedValue("request-1");
  api.alternatives.start.mockResolvedValue("alternatives-1");
  api.history.updateRevisions.mockResolvedValue({});
  api.revision.onEvent.mockImplementation((listener) => { revisionListener = listener; return vi.fn(); });
  api.alternatives.onEvent.mockImplementation((listener) => { alternativeListener = listener; return vi.fn(); });
});
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  scopes.splice(0).forEach((scope) => scope.stop());
});

describe("segment revision confirmation", () => {
  it("keeps suggestions out of the applied result and history until confirmed, then allows undo", async () => {
    const revision = createRevision();
    await revision.reviseSegment("更自然");
    revisionListener({ requestId: "request-1", status: "success", revision: suggestion });
    expect(revision.pendingRevision.value).toEqual(suggestion);
    expect(revision.revisions.value).toEqual([]);
    expect(api.history.updateRevisions).not.toHaveBeenCalled();
    revision.applyRevision();
    expect(revision.revisions.value).toEqual([suggestion]);
    expect(revision.pendingRevision.value).toBeUndefined();
    expect(api.history.updateRevisions).toHaveBeenCalledWith({ id: "history-1", revisions: [suggestion], resultText: "已应用的正文" });
    revision.undoRevision();
    expect(revision.revisions.value).toEqual([]);
    expect(api.history.updateRevisions).toHaveBeenLastCalledWith({ id: "history-1", revisions: [], resultText: "已应用的正文" });
  });

  it("discards suggestions and rejects late results after closing or switching sentences", async () => {
    const revision = createRevision();
    await revision.reviseSegment("更自然");
    revision.lockedSegmentId.value = undefined;
    expect(api.revision.cancel).toHaveBeenCalledWith("request-1");
    revisionListener({ requestId: "request-1", status: "success", revision: suggestion });
    expect(revision.pendingRevision.value).toBeUndefined();
    expect(revision.revisions.value).toEqual([]);
    expect(api.history.updateRevisions).not.toHaveBeenCalled();
  });

  it("cancels a request whose start response arrives after closing", async () => {
    let resolveStart: (value: string) => void = () => undefined;
    api.revision.start.mockImplementation(() => new Promise<string>((resolve) => { resolveStart = resolve; }));
    const revision = createRevision();
    const running = revision.reviseSegment("更自然");
    revision.discardSuggestion();
    resolveStart("late-request");
    await running;
    expect(api.revision.cancel).toHaveBeenCalledWith("late-request");
    revisionListener({ requestId: "late-request", status: "success", revision: suggestion });
    expect(revision.pendingRevision.value).toBeUndefined();
  });

  it("handles cached events before the IPC start response and rejects unrelated request IDs", async () => {
    api.revision.start.mockImplementation(async () => {
      revisionListener({ requestId: "other", status: "success", revision: { ...suggestion, newTarget: "错误建议" } });
      revisionListener({ requestId: "request-1", status: "success", revision: suggestion });
      return "request-1";
    });
    const revision = createRevision();
    await revision.reviseSegment("更自然");
    expect(revision.pendingRevision.value).toEqual(suggestion);
    revisionListener({ requestId: "other", status: "error", error: "错误请求" });
    expect(revision.revisionError.value).toBe("");
  });

  it("previews candidate translations without applying them and reports startup failure", async () => {
    const revision = createRevision();
    await revision.requestAlternatives();
    const alternative = { id: "candidate-1", label: "推荐译法" as const, target: "候选译文", description: "推荐" };
    alternativeListener({ requestId: "alternatives-1", status: "success", alternatives: [alternative] });
    revision.applyAlternative(alternative);
    expect(revision.pendingRevision.value?.newTarget).toBe("候选译文");
    expect(revision.revisions.value).toEqual([]);
    revision.discardSuggestion();
    expect(revision.pendingRevision.value).toBeUndefined();
    api.revision.start.mockRejectedValue(new Error("模型不可用"));
    await revision.reviseSegment("更自然");
    expect(revision.revisionStatus.value).toBe("error");
    expect(revision.revisionError.value).toBe("模型不可用");
  });

  it("keeps applied edits and exposes history persistence failures", async () => {
    const revision = createRevision();
    api.history.updateRevisions.mockRejectedValueOnce(new Error("disk full"));
    await revision.reviseSegment("更自然");
    revisionListener({ requestId: "request-1", status: "success", revision: suggestion });
    revision.applyRevision();
    await Promise.resolve();
    expect(revision.revisions.value).toEqual([suggestion]);
    expect(revision.revisionError.value).toContain("历史保存失败");
  });
});
