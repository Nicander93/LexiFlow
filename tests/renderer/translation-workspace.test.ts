import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick } from "vue";
import type { DictionaryLookupResult, TranslationEvent, TranslationHistory } from "../../electron/shared/types";
import { useTranslationWorkspace } from "../../src/features/translation/useTranslationWorkspace";
import { useWorkbenchUi } from "../../src/features/workbench/useWorkbenchUi";

const api = vi.hoisted(() => ({
  translation: { start: vi.fn(), cancel: vi.fn(), onEvent: vi.fn() },
  revision: { start: vi.fn(), cancel: vi.fn(), onEvent: vi.fn() },
  alternatives: { start: vi.fn(), cancel: vi.fn(), onEvent: vi.fn() },
  dictionary: { lookup: vi.fn(), context: { start: vi.fn(), cancel: vi.fn(), onEvent: vi.fn() } },
  clipboard: { writeText: vi.fn() }, history: { updateRevisions: vi.fn() }
}));
const cleanups = vi.hoisted(() => [] as Array<() => void>);
vi.mock("../../src/platform/translator", () => ({ getTranslatorApi: () => api }));
vi.mock("../../src/features/ocr/useOcrCapture", () => ({ useOcrCapture: () => ({}) }));
vi.mock("vue", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue")>(),
  onMounted: vi.fn(), onUnmounted: (callback: () => void) => cleanups.push(callback)
}));

let translationListener: (event: TranslationEvent) => void;
const scopes: ReturnType<typeof effectScope>[] = [];
const source = "This source sentence has enough words to skip automatic dictionary lookup.";
const history: TranslationHistory = {
  id: "history-1", sourceText: source, resultText: "第一句。第二句。", mode: "normal", profileId: "general",
  sourceLanguage: "en", targetLanguage: "zh-CN", provider: "ollama", model: "fixture", createdAt: "2026-09-30T00:00:00Z", isFavorite: false,
  segments: [
    { id: "1", source, target: "第一句。", sourceStart: 0, sourceEnd: source.length, boundaryAfter: "sentence" },
    { id: "2", source: "Second sentence.", target: "第二句。", sourceStart: source.length, sourceEnd: source.length + 16 }
  ], revisions: []
};

function createWorkspace() {
  const scope = effectScope();
  scopes.push(scope);
  return scope.run(useTranslationWorkspace)!;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.translation.start.mockResolvedValue("new-request");
  api.clipboard.writeText.mockResolvedValue(undefined);
  api.history.updateRevisions.mockResolvedValue({});
  api.dictionary.lookup.mockResolvedValue({ query: "history", normalizedQuery: "history", found: false, matchType: "none", suggestions: [] });
  api.translation.onEvent.mockImplementation((listener) => { translationListener = listener; return vi.fn(); });
  api.revision.onEvent.mockReturnValue(vi.fn());
  api.alternatives.onEvent.mockReturnValue(vi.fn());
  api.dictionary.context.onEvent.mockReturnValue(vi.fn());
  useWorkbenchUi().restoredHistory.value = undefined;
  useWorkbenchUi().setMode("normal");
});
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  scopes.splice(0).forEach((scope) => scope.stop());
});

describe("translation workspace editing", () => {
  it("retains the old translation while editing and copies its matching source and layout", async () => {
    const workspace = createWorkspace();
    useWorkbenchUi().restoreHistory(history);
    await nextTick();
    workspace.sourceText.value = "An edited source that should not erase the existing translated text.";
    await nextTick();
    expect(workspace.sourceDirty.value).toBe(true);
    expect(workspace.displayResultText.value).toBe("第一句。第二句。");
    workspace.toggleSegment("1");
    expect(workspace.showRevisionPopover.value).toBe(false);
    await workspace.copyBilingual();
    expect(api.clipboard.writeText).toHaveBeenLastCalledWith(`原文：${source}\n\n译文：第一句。第二句。`);
    workspace.clearInput();
    await nextTick();
    expect(workspace.sourceDirty.value).toBe(false);
    expect(workspace.displayResultText.value).toBe("");
  });

  it("retranslates unchanged source after switching target language", async () => {
    const workspace = createWorkspace();
    useWorkbenchUi().restoreHistory(history);
    await nextTick();
    workspace.targetLanguage.value = "en";
    await nextTick();
    expect(workspace.translationDirty.value).toBe(true);
    expect(workspace.displayResultText.value).toBe("第一句。第二句。");
    await workspace.triggerAiTranslate();
    expect(api.translation.start).toHaveBeenCalledWith(expect.objectContaining({ text: source, targetLanguage: "en" }));
  });

  it("restores applied changes with undo and ignores events from the previous session", async () => {
    const workspace = createWorkspace();
    useWorkbenchUi().restoreHistory({ ...history, resultText: "修改后。第二句。", revisions: [{
      id: "r1", segmentId: "1", previousTarget: "第一句。", newTarget: "修改后。", instruction: "更自然", createdAt: 1
    }] });
    await nextTick();
    expect(workspace.displayResultText.value).toBe("修改后。第二句。");
    translationListener({ requestId: "old-session", status: "streaming", content: "旧内容" });
    expect(workspace.displayResultText.value).toBe("修改后。第二句。");
    workspace.toggleSegment("1");
    workspace.undoRevision();
    expect(workspace.displayResultText.value).toBe("第一句。第二句。");
    expect(api.history.updateRevisions).toHaveBeenLastCalledWith({ id: history.id, revisions: [], resultText: "第一句。第二句。" });
  });

  it("rejects Chinese dictionary selections and ignores lookups completed after closing", async () => {
    const workspace = createWorkspace();
    await workspace.lookupDictionary("立即");
    expect(api.dictionary.lookup).not.toHaveBeenCalled();
    let resolveLookup: (value: DictionaryLookupResult) => void = () => undefined;
    api.dictionary.lookup.mockImplementation(() => new Promise<DictionaryLookupResult>((resolve) => { resolveLookup = resolve; }));
    const running = workspace.lookupDictionary("history", "1");
    workspace.closeDictionary();
    resolveLookup({ query: "history", normalizedQuery: "history", found: false, matchType: "none", suggestions: [] });
    await running;
    expect(workspace.dictionaryTerm.value).toBe("");
    expect(workspace.segmentDictionary.value).toBeNull();
    expect(workspace.dictionaryLoading.value).toBe(false);
  });
});
