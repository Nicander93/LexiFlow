import { describe, expect, it } from "vitest";
import { markDocumentChunkComplete, recoverDocumentTask, transitionDocumentTask } from "../electron/main/document/task-state";
import type { DocumentTask } from "../electron/shared/types";

const task: DocumentTask = { id: "task", fileName: "a.md", format: "markdown", totalChunks: 2, completedChunks: 0, status: "created", profileId: "general", model: "qwen", promptVersion: "v3.1", createdAt: 1, updatedAt: 1 };
describe("文档任务状态", () => {
  it("只允许安全状态流转，并在最后一块完成时结束", () => {
    const translating = transitionDocumentTask(transitionDocumentTask(task, "parsing"), "translating");
    expect(markDocumentChunkComplete(markDocumentChunkComplete(translating)).status).toBe("completed");
    expect(() => transitionDocumentTask(task, "completed")).toThrow("无法");
  });

  it("允许失败任务保留已完成分块后重试", () => {
    const translating = transitionDocumentTask(transitionDocumentTask(task, "parsing"), "translating");
    const failed = transitionDocumentTask(markDocumentChunkComplete(translating), "failed");
    expect(transitionDocumentTask(failed, "translating")).toMatchObject({ status: "translating", completedChunks: 1 });
  });

  it("启动后将中断的解析或翻译任务恢复为可继续状态", () => {
    const translating = transitionDocumentTask(transitionDocumentTask(task, "parsing"), "translating");
    expect(recoverDocumentTask(translating, 9)).toMatchObject({ status: "paused", completedChunks: 0, updatedAt: 9 });
    expect(recoverDocumentTask({ ...task, status: "completed" })).toMatchObject({ status: "completed" });
  });
});
