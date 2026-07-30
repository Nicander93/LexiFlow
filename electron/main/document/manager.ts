/**
 * 文档翻译：导入分块后进入单并发队列；每个分块同样经 resolveModelAccess。
 * 交互请求通过 ModelTaskScheduler 优先；暂停/取消会 abort 当前分块。失败分块写入 failedChunks 可重试。
 * PDF 仅提取已有文本层，扫描件需先走 OCR。
 * cancelAll / dispose 用于清除本地数据与应用退出，避免后台 upsert 回写。
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
import { modelTaskScheduler } from "../core/model-task-scheduler";
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
  private acceptingTasks = true;
  private disposed = false;
  private readonly idleResolvers: Array<() => void> = [];

  constructor(private readonly store: DocumentStore, private readonly profiles: ProfileStore, private readonly settings: SettingsStore, private readonly glossary: GlossaryStore) {}

  private emit(sender: Electron.WebContents, task: DocumentTaskRecord): void {
    if (!sender.isDestroyed()) sender.send("document:event", { task } satisfies DocumentTaskEvent);
  }

  private notifyIdle(): void {
    if (this.active.size > 0 || this.draining || this.queue.length > 0) return;
    const resolvers = this.idleResolvers.splice(0);
    for (const resolve of resolvers) resolve();
  }

  private async persistTask(task: DocumentTaskRecord): Promise<DocumentTaskRecord | undefined> {
    if (!this.acceptingTasks || this.disposed) return undefined;
    return this.store.upsert(task);
  }

  async waitForIdle(): Promise<void> {
    if (this.active.size === 0 && !this.draining && this.queue.length === 0) return;
    await new Promise<void>((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  /** 禁止新任务、清空队列、中止活动任务，并等待全部退出。清除数据后可 resumeAccepting。 */
  async cancelAll(): Promise<void> {
    this.acceptingTasks = false;
    const queued = this.queue.splice(0);
    for (const item of queued) {
      const task = this.store.get(item.taskId);
      if (task && ["created", "parsing", "translating", "paused"].includes(task.status)) {
        await this.store.upsert(transitionDocumentTask(task, "cancelled"));
      }
    }
    for (const controller of this.active.values()) controller.abort();
    await this.waitForIdle();
    for (const task of this.store.list()) {
      if (["created", "parsing", "translating", "paused"].includes(task.status)) {
        await this.store.upsert(transitionDocumentTask(task, "cancelled"));
      }
    }
  }

  resumeAccepting(): void {
    if (!this.disposed) this.acceptingTasks = true;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await this.cancelAll();
  }

  async import(sender: Electron.WebContents, request: DocumentImportRequest): Promise<DocumentTaskRecord | undefined> {
    if (!this.acceptingTasks || this.disposed) throw new Error("文档服务已停止，无法导入。");
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
    if (!this.acceptingTasks || this.disposed) throw new Error("文档服务已停止，无法启动任务。");
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
    const saved = await this.persistTask(task);
    if (!saved) return;
    task = saved;
    this.emit(sender, task);
    this.queue.push({ taskId, sender });
    void this.drainQueue();
  }

  private async drainQueue(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length) {
        if (!this.acceptingTasks) {
          this.queue.length = 0;
          break;
        }
        const next = this.queue.shift()!;
        await this.runTask(next.sender, next.taskId);
      }
    } finally {
      this.draining = false;
      this.notifyIdle();
      if (this.queue.length && this.acceptingTasks) void this.drainQueue();
    }
  }

  private async runTask(sender: Electron.WebContents, taskId: string): Promise<void> {
    let task = this.store.get(taskId);
    if (!task || task.status !== "translating" || !this.acceptingTasks) return;
    if (task.totalChunks === 0) {
      const saved = await this.persistTask(transitionDocumentTask(task, "completed"));
      if (saved) this.emit(sender, saved);
      return;
    }
    const controller = new AbortController();
    this.active.set(taskId, controller);
    try {
      if (!this.acceptingTasks || controller.signal.aborted) return;
      const profile = this.profiles.get(task.profileId);
      if (!profile) throw new Error("任务 Profile 不存在。");
      const taskSettings = this.settings.get();
      const access = resolveModelAccess(taskSettings, { profile, task: "document", textLength: 0 });
      if (!access.ok) throw new Error(access.error);
      const failedChunks = { ...(task.failedChunks ?? {}) };
      for (const chunk of task.chunks) {
        if (controller.signal.aborted || !this.acceptingTasks) return;
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
          profileId: profile.id,
          profilePrompt: profile.systemPrompt,
          temperature: profile.temperature,
          glossary: profile.enableGlossary ? this.glossary.matches(chunk.source, sourceLanguage, targetLanguage) : undefined
        };
        try {
          const chunkAccess = resolveModelAccess(taskSettings, { profile, task: "document", textLength: chunk.source.length });
          if (!chunkAccess.ok) throw new Error(chunkAccess.error);
          const response = await modelTaskScheduler.runBackground(async ({ signal: slotSignal }) => {
            let content = "";
            for await (const item of createProvider(chunkAccess.settings).translate(request, slotSignal, [sourceSegment])) {
              content += item.content;
            }
            return content;
          }, controller.signal);
          if (controller.signal.aborted || !this.acceptingTasks) return;
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
          const saved = await this.persistTask(task);
          if (!saved) return;
          task = saved;
          this.emit(sender, task);
        } catch (error) {
          if (controller.signal.aborted || !this.acceptingTasks) return;
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
          const saved = await this.persistTask(task);
          if (saved) this.emit(sender, saved);
          return;
        }
      }
      if (!controller.signal.aborted && this.acceptingTasks && Object.keys(failedChunks).length === 0 && task.completedChunks >= task.totalChunks) {
        const saved = await this.persistTask(transitionDocumentTask({ ...task, failedChunks }, "completed"));
        if (saved) this.emit(sender, saved);
      }
    } catch (error) {
      if (!controller.signal.aborted && this.acceptingTasks) {
        task = { ...task, status: "failed", error: error instanceof Error ? error.message : "文档翻译失败。", updatedAt: Date.now() };
        const saved = await this.persistTask(task);
        if (saved) this.emit(sender, saved);
      }
    } finally {
      this.active.delete(taskId);
      this.notifyIdle();
    }
  }

  async pause(taskId: string): Promise<void> {
    const task = this.store.get(taskId);
    if (!task) return;
    this.active.get(taskId)?.abort();
    this.removeFromQueue(taskId);
    if (task.status === "translating" && this.acceptingTasks) await this.store.upsert(transitionDocumentTask(task, "paused"));
    this.notifyIdle();
  }

  async cancel(taskId: string): Promise<void> {
    const task = this.store.get(taskId);
    if (!task) return;
    this.active.get(taskId)?.abort();
    this.removeFromQueue(taskId);
    if (["created", "parsing", "translating", "paused"].includes(task.status) && this.acceptingTasks) {
      await this.store.upsert(transitionDocumentTask(task, "cancelled"));
    }
    this.notifyIdle();
  }

  private removeFromQueue(taskId: string): void {
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      if (this.queue[index]?.taskId === taskId) this.queue.splice(index, 1);
    }
  }
}
