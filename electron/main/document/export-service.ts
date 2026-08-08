import { writeFile } from "node:fs/promises";
import { dialog, BrowserWindow } from "electron";
import type { DocumentExportRequest } from "../../shared/types";
import { assembleDocument } from "./chunking";
import type { DocumentStore } from "../storage/documents";

export class DocumentExportService {
  constructor(private readonly store: DocumentStore) {}

  async export(sender: Electron.WebContents, request: DocumentExportRequest): Promise<boolean> {
    const task = this.store.get(request.taskId);
    if (!task) throw new Error("文档任务不存在。");
    const defaultPath = task.fileName.replace(/(\.[^.]+)?$/, request.format === "bilingual" ? ".bilingual.md" : request.format === "json" ? ".translation.json" : ".translated$1");
    const parent = BrowserWindow.fromWebContents(sender);
    const target = parent ? await dialog.showSaveDialog(parent, { title: "导出翻译文档", defaultPath }) : await dialog.showSaveDialog({ title: "导出翻译文档", defaultPath });
    if (target.canceled || !target.filePath) return false;
    const translated = assembleDocument(task.chunks, task.translations);
    const content = request.format === "json"
      ? JSON.stringify({ task: { id: task.id, fileName: task.fileName, format: task.format, profileId: task.profileId, model: task.model, promptVersion: task.promptVersion, status: task.status, failedChunks: task.failedChunks }, chunks: task.chunks.map((chunk) => ({ ...chunk, translation: task.translations[chunk.id], failure: task.failedChunks?.[chunk.id] })) }, null, 2)
      : request.format === "bilingual"
        ? task.chunks.map((chunk) => chunk.translatable ? `> ${chunk.source}\n\n${task.translations[chunk.id] ?? chunk.source}` : chunk.source).join("\n\n")
        : translated;
    await writeFile(target.filePath, content, "utf8");
    return true;
  }
}

