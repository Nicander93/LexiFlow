/**
 * 文档翻译：导入分块后进入单并发队列；每个分块同样经 resolveModelAccess。
 * 交互请求通过 ModelTaskScheduler 优先；暂停/取消会 abort 当前分块。失败分块写入 failedChunks 可重试。
 * PDF 仅提取已有文本层，扫描件需先走 OCR。
 * cancelAll / dispose 用于清除本地数据与应用退出，避免后台 upsert 回写。
 */
import { IPC_CHANNELS, type DocumentExportRequest, type DocumentImportRequest, type DocumentTaskEvent, type DocumentTaskRecord } from "../../shared/types";
import { DocumentImportService } from "./import-service";
import { DocumentExportService } from "./export-service";
import { DocumentStore } from "../storage/documents";
import { ProfileStore } from "../storage/profiles";
import { SettingsStore } from "../storage/settings";
import { GlossaryStore } from "../storage/glossary";
import { TranslationEngine } from "../application/translation/translation-engine";
import type { ModelGatewayFactory } from "../domain/translation/ports";
import { transitionDocumentTask } from "./task-state";
import { resolveModelAccess } from "../core/model-access-gate";
import { DocumentTranslationWorker } from "./translation-worker";
import { DocumentTaskQueue } from "./task-queue";
export { extractPdfText } from "./import-service";

export class DocumentManager {
  private acceptingTasks = true;
  private disposed = false;
  private readonly importer: DocumentImportService;
  private readonly exporter: DocumentExportService;

  private readonly engine: TranslationEngine;
  private readonly worker: DocumentTranslationWorker;
  private readonly taskQueue: DocumentTaskQueue;

  constructor(private readonly store: DocumentStore, private readonly profiles: ProfileStore, private readonly settings: SettingsStore, private readonly glossary: GlossaryStore, engine?: TranslationEngine, createGateway?: ModelGatewayFactory) {
    this.importer = new DocumentImportService(store, profiles);
    this.exporter = new DocumentExportService(store);
    this.engine = engine ?? new TranslationEngine({
      getSettings: () => this.settings.get(),
      getProfile: (profileId) => this.profiles.get(profileId),
      matchGlossary: (text, sourceLanguage, targetLanguage) => this.glossary.matches(text, sourceLanguage, targetLanguage),
      createGateway: createGateway ?? (() => { throw new Error("Document TranslationEngine requires an injected ModelGatewayFactory."); })
    });
    this.worker = new DocumentTranslationWorker({
      store: this.store,
      profiles: this.profiles,
      settings: this.settings,
      engine: this.engine,
      persist: (task) => this.persistTask(task),
      emit: (sender, task) => this.emit(sender, task),
      isAccepting: () => this.acceptingTasks && !this.disposed
    });
    this.taskQueue = new DocumentTaskQueue({
      run: (item, signal) => this.worker.run(item.sender, item.taskId, signal),
      isAccepting: () => this.acceptingTasks && !this.disposed
    });
  }

  private emit(sender: Electron.WebContents, task: DocumentTaskRecord): void {
    if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.documentEvent, { task } satisfies DocumentTaskEvent);
  }

  private async persistTask(task: DocumentTaskRecord): Promise<DocumentTaskRecord | undefined> {
    if (!this.acceptingTasks || this.disposed) return undefined;
    return this.store.upsert(task);
  }

  async waitForIdle(): Promise<void> {
    await this.taskQueue.waitForIdle();
  }

  list(): DocumentTaskRecord[] {
    return this.store.list();
  }

  async delete(taskId: string): Promise<void> {
    this.taskQueue.abort(taskId);
    this.taskQueue.remove(taskId);
    await this.store.delete(taskId);
  }

  /** 禁止新任务、清空队列、中止活动任务，并等待全部退出。清除数据后可 resumeAccepting。 */
  async cancelAll(): Promise<void> {
    this.acceptingTasks = false;
    const queued = this.taskQueue.clearQueued();
    for (const item of queued) {
      const task = this.store.get(item.taskId);
      if (task && ["created", "parsing", "translating", "paused"].includes(task.status)) {
        await this.store.upsert(transitionDocumentTask(task, "cancelled"));
      }
    }
    this.taskQueue.abortActive();
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
    return this.importer.import(sender, request);
  }

  async export(sender: Electron.WebContents, request: DocumentExportRequest): Promise<boolean> {
    return this.exporter.export(sender, request);
  }

  async start(sender: Electron.WebContents, taskId: string): Promise<void> {
    if (!this.acceptingTasks || this.disposed) throw new Error("文档服务已停止，无法启动任务。");
    let task = this.store.get(taskId);
    if (!task) throw new Error("文档任务不存在。");
    if (this.taskQueue.isScheduled(taskId)) return;
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
    this.taskQueue.enqueue({ taskId, sender });
  }

  async pause(taskId: string): Promise<void> {
    const task = this.store.get(taskId);
    if (!task) return;
    this.taskQueue.abort(taskId);
    this.taskQueue.remove(taskId);
    if (task.status === "translating" && this.acceptingTasks) await this.store.upsert(transitionDocumentTask(task, "paused"));
  }

  async cancel(taskId: string): Promise<void> {
    const task = this.store.get(taskId);
    if (!task) return;
    this.taskQueue.abort(taskId);
    this.taskQueue.remove(taskId);
    if (["created", "parsing", "translating", "paused"].includes(task.status) && this.acceptingTasks) {
      await this.store.upsert(transitionDocumentTask(task, "cancelled"));
    }
  }
}
