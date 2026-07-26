import type { DocumentTask, DocumentTaskStatus } from "../../shared/types";

const ALLOWED: Record<DocumentTaskStatus, DocumentTaskStatus[]> = {
  created: ["parsing", "cancelled", "failed"],
  parsing: ["translating", "cancelled", "failed"],
  translating: ["paused", "completed", "cancelled", "failed"],
  paused: ["translating", "cancelled"],
  completed: [], failed: ["translating"], cancelled: []
};

export function transitionDocumentTask<T extends DocumentTask>(task: T, status: DocumentTaskStatus, now = Date.now()): T {
  if (!ALLOWED[task.status].includes(status)) throw new Error(`文档任务无法从 ${task.status} 变更为 ${status}。`);
  return { ...task, status, updatedAt: now } as T;
}

export function markDocumentChunkComplete<T extends DocumentTask>(task: T, now = Date.now()): T {
  if (task.status !== "translating") throw new Error("只有翻译中的任务可以完成分块。 ");
  const completedChunks = Math.min(task.totalChunks, task.completedChunks + 1);
  return { ...task, completedChunks, status: completedChunks === task.totalChunks ? "completed" : "translating", updatedAt: now } as T;
}

/** Restores an interrupted foreground/background task to a user-resumable state after app restart. */
export function recoverDocumentTask<T extends DocumentTask>(task: T, now = Date.now()): T {
  if (task.status !== "parsing" && task.status !== "translating") return task;
  return { ...task, status: "paused", updatedAt: now, error: "应用上次退出时任务未完成；可继续处理。" } as T;
}
