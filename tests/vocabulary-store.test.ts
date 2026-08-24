import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const state = vi.hoisted(() => ({ userData: "" }));
vi.mock("electron", () => ({ app: { getPath: () => state.userData } }));

import { VocabularyStore } from "../electron/main/storage/vocabulary";
import { isStoredVocabulary } from "../electron/main/storage/schema";

describe("VocabularyStore", () => {
  beforeEach(async () => { state.userData = await mkdtemp(join(tmpdir(), "lexiflow-vocabulary-")); });
  afterEach(async () => { await rm(state.userData, { recursive: true, force: true }); });

  it("持久化生词并按语言和词头合并重复条目", async () => {
    const store = new VocabularyStore();
    await store.initialize();
    const first = await store.upsert({ term: "Observable", translation: "可观察的", sourceLanguage: "en", targetLanguage: "zh-CN" });
    const updated = await store.upsert({ term: "observable", translation: "可监测的", sourceLanguage: "en", targetLanguage: "zh-CN", note: "RxJS" });
    expect(updated.id).toBe(first.id);
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]).toMatchObject({ translation: "可监测的", note: "RxJS", status: "learning" });
    const persisted = JSON.parse(await readFile(join(state.userData, "vocabulary.json"), "utf8"));
    expect(isStoredVocabulary(persisted)).toBe(true);
  });

  it("支持标记掌握、删除和清空", async () => {
    const store = new VocabularyStore();
    await store.initialize();
    const entry = await store.upsert({ term: "flow", translation: "流动", sourceLanguage: "en", targetLanguage: "zh-CN", status: "mastered" });
    expect(store.list()[0].status).toBe("mastered");
    await store.delete(entry.id);
    expect(store.list()).toEqual([]);
    await store.clear();
    expect(store.list()).toEqual([]);
  });
});
