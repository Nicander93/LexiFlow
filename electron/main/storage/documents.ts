import { app } from "electron";
import { join } from "node:path";
import type { DocumentTaskRecord } from "../../shared/types";
import { JsonStore } from "./json-store";
import { recoverDocumentTask } from "../document/task-state";
import { isStoredDocuments } from "./schema";

export interface DocumentTasksFile {
  schemaVersion: 1;
  tasks: DocumentTaskRecord[];
}

function normalizeTask(task: DocumentTaskRecord): DocumentTaskRecord {
  return recoverDocumentTask({
    ...task,
    promptVersion: task.promptVersion || "legacy",
    failedChunks: task.failedChunks ?? {}
  });
}

export class DocumentStore {
  private store!: JsonStore<DocumentTasksFile | DocumentTaskRecord[]>;
  private tasks: DocumentTaskRecord[] = [];

  async initialize(): Promise<void> {
    this.store = new JsonStore(join(app.getPath("userData"), "document-tasks.json"), { schemaVersion: 1, tasks: [] }, {
      backup: true,
      validate: isStoredDocuments
    });
    const raw = await this.store.read() as DocumentTasksFile | DocumentTaskRecord[];
    const legacy = Array.isArray(raw);
    const stored = legacy ? raw : (raw.tasks ?? []);
    this.tasks = stored.map(normalizeTask);
    if (legacy || this.tasks.some((task, index) => task.status !== stored[index]?.status || task.promptVersion !== stored[index]?.promptVersion || !stored[index]?.failedChunks)) {
      await this.persist();
    }
  }

  private async persist(): Promise<void> {
    await this.store.write({ schemaVersion: 1, tasks: this.tasks });
  }

  list(): DocumentTaskRecord[] { return structuredClone(this.tasks); }
  get(id: string): DocumentTaskRecord | undefined {
    const task = this.tasks.find((item) => item.id === id);
    return task && structuredClone(task);
  }
  async upsert(task: DocumentTaskRecord): Promise<DocumentTaskRecord> {
    const normalized = { ...task, failedChunks: task.failedChunks ?? {} };
    const index = this.tasks.findIndex((item) => item.id === normalized.id);
    if (index < 0) this.tasks.unshift(normalized); else this.tasks[index] = normalized;
    await this.persist();
    return structuredClone(normalized);
  }
  async delete(id: string): Promise<void> {
    this.tasks = this.tasks.filter((task) => task.id !== id);
    await this.persist();
  }
  async clear(): Promise<void> {
    this.tasks = [];
    await this.persist();
  }
}
