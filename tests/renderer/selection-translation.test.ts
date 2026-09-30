import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { TranslationEvent } from "../../electron/shared/types";
import { useSelectionTranslation } from "../../src/features/translation/useSelectionTranslation";

const api = vi.hoisted(() => ({ selectionTranslation: { start: vi.fn(), cancel: vi.fn(), onEvent: vi.fn() }, clipboard: { writeText: vi.fn() } }));
const cleanups = vi.hoisted(() => [] as Array<() => void>);
vi.mock("../../src/platform/translator", () => ({ getTranslatorApi: () => api }));
vi.mock("vue", async (original) => ({ ...await original<typeof import("vue")>(), onUnmounted: (callback: () => void) => cleanups.push(callback) }));
let listener: (event: TranslationEvent) => void;
beforeEach(() => {
  vi.clearAllMocks();
  api.selectionTranslation.start.mockResolvedValue("selected-1");
  api.selectionTranslation.onEvent.mockImplementation((callback) => { listener = callback; return vi.fn(); });
});
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

describe("selection translation", () => {
  it("sends only the selection and copies only its result", async () => {
    const selected = useSelectionTranslation(ref("general"));
    await selected.start("  selected English text  ");
    expect(api.selectionTranslation.start).toHaveBeenCalledWith({ text: "selected English text", profileId: "general" });
    expect(selected.targetLanguage.value).toBe("zh-CN");
    listener({ requestId: "other", status: "success", content: "wrong result" });
    expect(selected.state.value.content).toBe("");
    listener({ requestId: "selected-1", status: "success", content: "选区译文" });
    await selected.copy();
    expect(api.clipboard.writeText).toHaveBeenCalledWith("选区译文");
    expect(selected.copied.value).toBe(true);
  });

  it("translates Chinese to English and accepts events arriving before start resolves", async () => {
    api.selectionTranslation.start.mockImplementation(async () => {
      listener({ requestId: "selected-1", status: "success", content: "Selected translation" });
      return "selected-1";
    });
    const selected = useSelectionTranslation();
    await selected.start("选中的中文");
    expect(selected.targetLanguage.value).toBe("en");
    expect(selected.state.value.content).toBe("Selected translation");
  });

  it("cancels a start response arriving after closing and ignores its result", async () => {
    let resolveStart!: (id: string) => void;
    api.selectionTranslation.start.mockImplementation(() => new Promise<string>((resolve) => { resolveStart = resolve; }));
    const selected = useSelectionTranslation();
    const running = selected.start("hello");
    selected.close();
    resolveStart("late-id");
    await running;
    listener({ requestId: "late-id", status: "success", content: "late result" });
    expect(api.selectionTranslation.cancel).toHaveBeenCalledWith("late-id");
    expect(selected.sourceText.value).toBe("");
    expect(selected.state.value.status).toBe("idle");
  });

  it("retains the selection for retry after cancellation or startup failure", async () => {
    const selected = useSelectionTranslation();
    await selected.start("hello");
    selected.cancel();
    listener({ requestId: "selected-1", status: "success", content: "late result" });
    expect(selected.state.value.status).toBe("cancelled");
    expect(selected.sourceText.value).toBe("hello");
    api.selectionTranslation.start.mockRejectedValue(new Error("model unavailable"));
    await selected.start(selected.sourceText.value);
    expect(selected.state.value.error).toBe("model unavailable");
    expect(selected.sourceText.value).toBe("hello");
  });
});
