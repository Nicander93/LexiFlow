import type { WebContents } from "electron";

export interface DocumentQueueItem {
  taskId: string;
  sender: WebContents;
}

export interface DocumentTaskQueueDependencies {
  run: (item: DocumentQueueItem, signal: AbortSignal) => Promise<void>;
  isAccepting: () => boolean;
}

/** Serial document queue with isolated cancellation from interactive requests. */
export class DocumentTaskQueue {
  private readonly queued: DocumentQueueItem[] = [];
  private readonly active = new Map<string, AbortController>();
  private draining = false;
  private readonly idleResolvers: Array<() => void> = [];

  constructor(private readonly dependencies: DocumentTaskQueueDependencies) {}

  enqueue(item: DocumentQueueItem): void {
    this.queued.push(item);
    void this.drain();
  }

  isScheduled(taskId: string): boolean {
    return this.active.has(taskId) || this.queued.some((item) => item.taskId === taskId);
  }

  abort(taskId: string): void {
    this.active.get(taskId)?.abort();
  }

  remove(taskId: string): void {
    for (let index = this.queued.length - 1; index >= 0; index -= 1) {
      if (this.queued[index]?.taskId === taskId) this.queued.splice(index, 1);
    }
  }

  clearQueued(): DocumentQueueItem[] {
    return this.queued.splice(0);
  }

  abortActive(): void {
    for (const controller of this.active.values()) controller.abort();
  }

  async waitForIdle(): Promise<void> {
    if (this.active.size === 0 && !this.draining && this.queued.length === 0) return;
    await new Promise<void>((resolve) => this.idleResolvers.push(resolve));
  }

  private notifyIdle(): void {
    if (this.active.size > 0 || this.draining || this.queued.length > 0) return;
    const resolvers = this.idleResolvers.splice(0);
    for (const resolve of resolvers) resolve();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queued.length) {
        if (!this.dependencies.isAccepting()) {
          this.queued.length = 0;
          break;
        }
        const item = this.queued.shift()!;
        const controller = new AbortController();
        this.active.set(item.taskId, controller);
        try {
          await this.dependencies.run(item, controller.signal);
        } finally {
          this.active.delete(item.taskId);
        }
      }
    } finally {
      this.draining = false;
      this.notifyIdle();
      if (this.queued.length && this.dependencies.isAccepting()) void this.drain();
    }
  }
}
