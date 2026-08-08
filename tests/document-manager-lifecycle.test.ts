import { describe, expect, it, vi, beforeEach } from "vitest";
import type { DocumentTaskRecord } from "../electron/shared/types";
import { DEFAULT_SETTINGS } from "../electron/shared/defaults";
import { getBuiltInProfiles } from "../electron/main/storage/profiles";

vi.mock("electron", () => ({
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  BrowserWindow: { fromWebContents: () => null },
  app: { getPath: () => "/tmp/lexiflow-test" }
}));

vi.mock("../electron/main/provider", () => ({
  createProvider: () => ({
    translate: async function* () {
      yield { content: '{"segments":[{"id":"c1","target":"译文"}]}' };
    }
  })
}));

vi.mock("../electron/main/core/model-task-scheduler", () => {
  class Scheduler {
    runInteractive<T>(task: (ctx: { signal: AbortSignal }) => Promise<T>, signal?: AbortSignal): Promise<T> {
      if (signal?.aborted) return Promise.reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      return task({ signal: signal ?? new AbortController().signal });
    }
    runBackground<T>(task: (ctx: { signal: AbortSignal }) => Promise<T>, signal?: AbortSignal): Promise<T> {
      if (signal?.aborted) return Promise.reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      return task({ signal: signal ?? new AbortController().signal });
    }
    cancelBackground(): void { return; }
    async waitForIdle(): Promise<void> { return; }
  }
  return { ModelTaskScheduler: Scheduler, modelTaskScheduler: new Scheduler() };
});

import { DocumentManager } from "../electron/main/document/manager";

function createTask(overrides: Partial<DocumentTaskRecord> = {}): DocumentTaskRecord {
  return {
    id: "task-1",
    fileName: "a.txt",
    sourcePath: "a.txt",
    format: "txt",
    totalChunks: 1,
    completedChunks: 0,
    status: "created",
    profileId: "general",
    model: "qwen",
    promptVersion: "v3.1",
    createdAt: 1,
    updatedAt: 1,
    chunks: [{ id: "c1", source: "Hello", translatable: true }],
    translations: {},
    failedChunks: {},
    ...overrides
  };
}

function createHarness() {
  const tasks = new Map<string, DocumentTaskRecord>();
  const store = {
    list: () => [...tasks.values()].map((task) => structuredClone(task)),
    get: (id: string) => {
      const task = tasks.get(id);
      return task && structuredClone(task);
    },
    upsert: async (task: DocumentTaskRecord) => {
      tasks.set(task.id, structuredClone(task));
      return structuredClone(task);
    },
    clear: async () => { tasks.clear(); },
    delete: async (id: string) => { tasks.delete(id); }
  };
  const profiles = {
    get: (id?: string) => getBuiltInProfiles().find((profile) => profile.id === id),
    list: () => getBuiltInProfiles()
  };
  const settings = { get: () => structuredClone(DEFAULT_SETTINGS) };
  const glossary = { matches: () => undefined };
  const gateway = {
    translate: async function* () { yield { content: '{"segments":[{"id":"c1","target":"译文"}]}' }; },
    chat: async function* () { yield { content: "" }; }
  };
  const manager = new DocumentManager(store as never, profiles as never, settings as never, glossary as never, undefined, () => gateway as never);
  const sender = { isDestroyed: () => false, send: vi.fn() } as unknown as Electron.WebContents;
  return { manager, store, tasks, sender };
}

describe("DocumentManager 生命周期", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("队列中有任务时 cancelAll 清空并标记 cancelled", async () => {
    const { manager, store, sender } = createHarness();
    const task = createTask();
    await store.upsert(task);
    await manager.start(sender, task.id);
    await manager.cancelAll();
    expect(store.get(task.id)?.status).toBe("cancelled");
    await expect(manager.start(sender, task.id)).rejects.toThrow("文档服务已停止");
  });

  it("cancelAll 后 resumeAccepting 可再次启动", async () => {
    const { manager, store, sender } = createHarness();
    const first = createTask({ id: "task-2a" });
    await store.upsert(first);
    await manager.cancelAll();
    manager.resumeAccepting();
    const second = createTask({ id: "task-2b" });
    await store.upsert(second);
    await manager.start(sender, second.id);
    await manager.waitForIdle();
    expect(["translating", "completed", "failed"]).toContain(store.get(second.id)?.status);
  });

  it("dispose 后不能再启动新任务", async () => {
    const { manager, store, sender } = createHarness();
    const task = createTask({ id: "task-3" });
    await store.upsert(task);
    await manager.dispose();
    manager.resumeAccepting();
    await expect(manager.start(sender, task.id)).rejects.toThrow("文档服务已停止");
  });

  it("清除后活动任务不会通过 persistTask 回写", async () => {
    const { manager, store, sender } = createHarness();
    const task = createTask({
      id: "task-4",
      chunks: [
        { id: "c1", source: "One", translatable: true },
        { id: "c2", source: "Two", translatable: true }
      ],
      totalChunks: 2
    });
    await store.upsert(task);
    const startPromise = manager.start(sender, task.id);
    await manager.cancelAll();
    await startPromise.catch(() => undefined);
    await store.clear();
    await manager.waitForIdle();
    expect(store.list()).toEqual([]);
  });
});
