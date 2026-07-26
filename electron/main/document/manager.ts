/**
 * 文档翻译：导入分块后进入单并发队列；每个分块同样经 resolveModelAccess。
 * 交互请求通过 ModelConcurrencyGate 优先；暂停/取消会 abort 当前分块。失败分块写入 failedChunks 可重试。
 * PDF 仅提取已有文本层，扫描件需先走 OCR。
 */
import { randomUUID } from "node:crypto";
import { basename, extname } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { dialog, BrowserWindow } from "electron";
import { PDFParse } from "pdf-parse";
import type { DocumentExportRequest, DocumentImportRequest, DocumentTaskEvent, DocumentTaskRecord, SourceSegment, TranslationRequest } from "../../shared/types";
import { chunkDocument, type DocumentFormat, assembleDocument } from "./chunking";
import { DocumentStore } from "../storage/documents";
import { ProfileStore } from "../storage/profiles";
import { SettingsStore } from "../storage/settings";
import { GlossaryStore } from "../storage/glossary";
import { createProvider } from "../provider";
import { createTranslationResult } from "../translation/result";
import { transitionDocumentTask } from "./task-state";
import { resolveModelAccess } from "../core/model-access-gate";
import { modelConcurrencyGate } from "../core/model-concurrency-gate";
import { detectLanguage, resolveTargetLanguage } from "../core/language";
import { PROMPT_VERSION } from "../../shared/defaults";

const FORMAT_BY_EXTENSION: Record<string, DocumentFormat | undefined> = { ".txt": "txt", ".md": "markdown", ".markdown": "markdown", ".srt": "srt", ".pdf": "pdf", ".ts": "code", ".tsx": "code", ".js": "code", ".jsx": "code", ".py": "code", ".java": "code", ".json": "code", ".yaml": "code", ".yml": "code", ".toml": "code", ".ini": "code", ".properties": "code" };

export async function extractPdfText(sourcePath: string): Promise<string> {
  const parser = new PDFParse({ data: await readFile(sourcePath) });
  try {
    const result = await parser.getText();
    const text = result.text.trim();
    if (!text) throw new Error("该 PDF 未包含可提取文本；扫描件请先使用 OCR。");
    return text;
  } finally {
    await parser.destroy();
  }
}

export class DocumentManager {
  private readonly active = new Map<string, AbortController>();
  private readonly queue: Array<{ taskId: string; sender: Electron.WebContents }> = [];
  private draining = false;

  constructor(private readonly store: DocumentStore, private readonly profiles: ProfileStore, private readonly settings: SettingsStore, private readonly glossary: GlossaryStore) {}

  private emit(sender: Electron.WebContents, task: DocumentTaskRecord): void {
    if (!sender.isDestroyed()) sender.send("document:event", { task } satisfies DocumentTaskEvent);
  }

  async import(sender: Electron.WebContents, request: DocumentImportRequest): Promise<DocumentTaskRecord | undefined> {
    const options: Electron.OpenDialogOptions = { title: "选择待翻译文档", properties: ["openFile"], filters: [{ name: "文档与代码预览", extensions: ["txt", "md", "markdown", "srt", "pdf", "ts", "tsx", "js", "jsx", "py", "java", "json", "yaml", "yml", "toml", "ini", "properties"] }] };
    const parent = BrowserWindow.fromWebContents(sender);
    const selected = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    if (selected.canceled || !selected.filePaths[0]) return undefined;
    const sourcePath = selected.filePaths[0];
    const format = FORMAT_BY_EXTENSION[extname(sourcePath).toLowerCase()];
    if (!format) throw new Error("仅支持 TXT、Markdown、SRT、纯文本 PDF 及常见代码/配置文件。");
    const profile = this.profiles.get(request.profileId);
    if (!profile) throw new Error("所选 Profile 不存在。");
    const source = format === "pdf" ? await extractPdfText(sourcePath) : await readFile(sourcePath, "utf8");
    const now = Date.now();
    const chunks = chunkDocument(source, format);
    const task: DocumentTaskRecord = {
      id: randomUUID(),
      fileName: basename(sourcePath),
      sourcePath,
      format,
      totalChunks: chunks.filter((chunk) => chunk.translatable).length,
      completedChunks: 0,
      status: "created",
      profileId: profile.id,
      model: profile.modelId ?? "default",
      promptVersion: PROMPT_VERSION,
      createdAt: now,
      updatedAt: now,
      chunks,
      translations: {},
      failedChunks: {}
    };
    return this.store.upsert(task);
  }

  async export(sender: Electron.WebContents, request: DocumentExportRequest): Promise<boolean> {
    const task = this.store.get(request.taskId);
    if (!task) throw new Error("文档任务不存在。");
    const defaultPath = task.fileName.replace(/(\.[^.]+)?$/, request.format === "bilingual" ? ".bilingual.md" : request.format === "json" ? ".translation.json" : ".translated$1");
    const options = { title: "导出翻译文档", defaultPath };
    const parent = BrowserWindow.fromWebContents(sender);
    const target = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options);
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

  async start(sender: Electron.WebContents, taskId: string): Promise<void> {
    let task = this.store.get(taskId);
    if (!task) throw new Error("文档任务不存在。");
    if (this.active.has(taskId) || this.queue.some((item) => item.taskId === taskId)) return;
    const profile = this.profiles.get(task.profileId);
    if (!profile) throw new Error("任务 Profile 不存在。");
    const access = resolveModelAccess(this.settings.get(), { profile, task: "document", textLength: 0 });
    if (!access.ok) throw new Error(access.error);
    if (task.status === "created") task = transitionDocumentTask(transitionDocumentTask(task, "parsing"), "translating");
    else if (task.status === "paused" || task.status === "failed") task = { ...transitionDocumentTask(task, "translating"), error: undefined };
    else if (task.status !== "translating") throw new Error("该文档任务不能继续执行。");
    task = await this.store.upsert(task);
    this.emit(sender, task);
    this.queue.push({ taskId, sender });
    void this.drainQueue();
  }

  private async drainQueue(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length) {
        const next = this.queue.shift()!;
        await this.runTask(next.sender, next.taskId);
      }
    } finally {
      this.draining = false;
      if (this.queue.length) void this.drainQueue();
    }
  }

  private async runTask(sender: Electron.WebContents, taskId: string): Promise<void> {
    let task = this.store.get(taskId);
    if (!task || task.status !== "translating") return;
    if (task.totalChunks === 0) {
      task = await this.store.upsert(transitionDocumentTask(task, "completed"));
      this.emit(sender, task);
      return;
    }
    const controller = new AbortController();
    this.active.set(taskId, controller);
    let held = false;
    try {
      await modelConcurrencyGate.acquireDocument(controller.signal);
      held = true;
      const profile = this.profiles.get(task.profileId);
      if (!profile) throw new Error("任务 Profile 不存在。");
      const taskSettings = this.settings.get();
      const access = resolveModelAccess(taskSettings, { profile, task: "document", textLength: 0 });
      if (!access.ok) throw new Error(access.error);
      const failedChunks = { ...(task.failedChunks ?? {}) };
      for (const chunk of task.chunks) {
        if (controller.signal.aborted) return;
        await modelConcurrencyGate.yieldForInteractive(controller.signal);
        if (!chunk.translatable) continue;
        const needsWork = task.translations[chunk.id] === undefined || Boolean(failedChunks[chunk.id]);
        if (!needsWork) continue;
        const sourceSegment: SourceSegment = { id: chunk.id, source: chunk.source, sourceStart: 0, sourceEnd: chunk.source.length };
        const sourceLanguage = detectLanguage(chunk.source);
        const targetLanguage = resolveTargetLanguage(chunk.source, profile.targetLanguage);
        const request: TranslationRequest = {
          text: chunk.source,
          mode: "normal",
          targetLanguage,
          profilePrompt: profile.systemPrompt,
          temperature: profile.temperature,
          glossary: profile.enableGlossary ? this.glossary.matches(chunk.source, sourceLanguage, targetLanguage) : undefined
        };
        try {
          const chunkAccess = resolveModelAccess(taskSettings, { profile, task: "document", textLength: chunk.source.length });
          if (!chunkAccess.ok) throw new Error(chunkAccess.error);
          let response = "";
          for await (const item of createProvider(chunkAccess.settings).translate(request, controller.signal, [sourceSegment])) {
            response += item.content;
          }
          const result = createTranslationResult({
            requestId: task.id,
            sourceText: chunk.source,
            sourceLanguage,
            targetLanguage,
            sourceSegments: [sourceSegment],
            modelInfo: { provider: chunkAccess.settings.provider.type, model: chunkAccess.settings.provider.model, durationMs: 0 },
            responseText: response
          });
          const wasFailed = Boolean(failedChunks[chunk.id]);
          const wasNew = task.translations[chunk.id] === undefined;
          task.translations[chunk.id] = result.targetText;
          delete failedChunks[chunk.id];
          if (wasNew || wasFailed) {
            if (wasNew) task.completedChunks += 1;
          }
          task.failedChunks = failedChunks;
          task.updatedAt = Date.now();
          if (task.completedChunks >= task.totalChunks && Object.keys(failedChunks).length === 0) task.status = "completed";
          task = await this.store.upsert(task);
          this.emit(sender, task);
        } catch (error) {
          if (controller.signal.aborted) return;
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
          task = await this.store.upsert(task);
          this.emit(sender, task);
          return;
        }
      }
      if (!controller.signal.aborted && Object.keys(failedChunks).length === 0 && task.completedChunks >= task.totalChunks) {
        task = await this.store.upsert(transitionDocumentTask({ ...task, failedChunks }, "completed"));
        this.emit(sender, task);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        task = { ...task, status: "failed", error: error instanceof Error ? error.message : "文档翻译失败。", updatedAt: Date.now() };
        task = await this.store.upsert(task);
        this.emit(sender, task);
      }
    } finally {
      this.active.delete(taskId);
      if (held) modelConcurrencyGate.releaseDocument();
    }
  }

  async pause(taskId: string): Promise<void> {
    const task = this.store.get(taskId);
    if (!task) return;
    this.active.get(taskId)?.abort();
    this.removeFromQueue(taskId);
    if (task.status === "translating") await this.store.upsert(transitionDocumentTask(task, "paused"));
  }

  async cancel(taskId: string): Promise<void> {
    const task = this.store.get(taskId);
    if (!task) return;
    this.active.get(taskId)?.abort();
    this.removeFromQueue(taskId);
    if (["created", "parsing", "translating", "paused"].includes(task.status)) {
      await this.store.upsert(transitionDocumentTask(task, "cancelled"));
    }
  }

  private removeFromQueue(taskId: string): void {
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      if (this.queue[index]?.taskId === taskId) this.queue.splice(index, 1);
    }
  }
}
