import type { WebContents } from "electron";
import type { DocumentTaskRecord } from "../../shared/types";
import { resolveModelAccess } from "../core/model-access-gate";
import { modelTaskScheduler } from "../core/model-task-scheduler";
import { transitionDocumentTask } from "./task-state";
import type { TranslationEngine } from "../application/translation/translation-engine";
import type { DocumentStore } from "../storage/documents";
import type { ProfileStore } from "../storage/profiles";
import type { SettingsStore } from "../storage/settings";

export interface DocumentTranslationWorkerDependencies {
  store: DocumentStore;
  profiles: ProfileStore;
  settings: SettingsStore;
  engine: TranslationEngine;
  persist: (task: DocumentTaskRecord) => Promise<DocumentTaskRecord | undefined>;
  emit: (sender: WebContents, task: DocumentTaskRecord) => void;
  isAccepting: () => boolean;
}

/** Runs one document task; queueing and import/export remain outside the worker. */
export class DocumentTranslationWorker {
  constructor(private readonly dependencies: DocumentTranslationWorkerDependencies) {}

  async run(sender: WebContents, taskId: string, signal: AbortSignal): Promise<void> {
    const { store, profiles, settings, engine, persist, emit, isAccepting } = this.dependencies;
    let task = store.get(taskId);
    if (!task || task.status !== "translating" || !isAccepting()) return;
    if (task.totalChunks === 0) {
      const saved = await persist(transitionDocumentTask(task, "completed"));
      if (saved) emit(sender, saved);
      return;
    }

    try {
      if (!isAccepting() || signal.aborted) return;
      const profile = profiles.get(task.profileId);
      if (!profile) throw new Error("任务 Profile 不存在。");
      const taskSettings = settings.get();
      const access = resolveModelAccess(taskSettings, { profile, task: "document", textLength: 0 });
      if (!access.ok) throw new Error(access.error);
      const failedChunks = { ...(task.failedChunks ?? {}) };
      for (const chunk of task.chunks) {
        if (signal.aborted || !isAccepting()) return;
        if (!chunk.translatable) continue;
        const needsWork = task.translations[chunk.id] === undefined || Boolean(failedChunks[chunk.id]);
        if (!needsWork) continue;
        try {
          const response = await modelTaskScheduler.runBackground(async ({ signal: slotSignal }) => engine.translate({
            text: chunk.source,
            taskType: "document-chunk",
            targetLanguage: profile.targetLanguage,
            profileId: profile.id,
            segmentId: chunk.id,
            signal: slotSignal
          }), signal);
          if (signal.aborted || !isAccepting()) return;
          const wasFailed = Boolean(failedChunks[chunk.id]);
          const wasNew = task.translations[chunk.id] === undefined;
          task.translations[chunk.id] = response.targetText;
          delete failedChunks[chunk.id];
          if (wasNew || wasFailed) {
            if (wasNew) task.completedChunks += 1;
          }
          task.failedChunks = failedChunks;
          task.updatedAt = Date.now();
          if (task.completedChunks >= task.totalChunks && Object.keys(failedChunks).length === 0) task.status = "completed";
          const saved = await persist(task);
          if (!saved) return;
          task = saved;
          emit(sender, task);
        } catch (error) {
          if (signal.aborted || !isAccepting()) return;
          failedChunks[chunk.id] = {
            error: error instanceof Error ? error.message : "分块翻译失败。",
            retryable: true,
            failedAt: Date.now()
          };
          task = {
            ...task,
            failedChunks,
            status: "failed",
            error: `分块 ${chunk.id} 失败：${failedChunks[chunk.id].error}`,
            updatedAt: Date.now()
          };
          const saved = await persist(task);
          if (saved) emit(sender, saved);
          return;
        }
      }
      if (!signal.aborted && isAccepting() && Object.keys(failedChunks).length === 0 && task.completedChunks >= task.totalChunks) {
        const saved = await persist(transitionDocumentTask({ ...task, failedChunks }, "completed"));
        if (saved) emit(sender, saved);
      }
    } catch (error) {
      if (!signal.aborted && isAccepting()) {
        task = { ...task, status: "failed", error: error instanceof Error ? error.message : "文档翻译失败。", updatedAt: Date.now() };
        const saved = await persist(task);
        if (saved) emit(sender, saved);
      }
    }
  }
}
