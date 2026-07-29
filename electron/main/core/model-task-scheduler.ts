/**
 * 本地模型单通道调度：同一时刻只跑一个生成任务。
 * 交互任务优先于文档后台分块；文档在分块边界释放，不整任务占锁。
 */
export type ModelTaskPriority = "interactive" | "background";

export interface ModelTaskContext {
  signal: AbortSignal;
}

interface QueuedTask<T> {
  priority: ModelTaskPriority;
  task: (context: ModelTaskContext) => Promise<T>;
  signal?: AbortSignal;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function abortError(): Error {
  return Object.assign(new Error("Aborted"), { name: "AbortError" });
}

export class ModelTaskScheduler {
  private running = false;
  private readonly interactiveQueue: Array<QueuedTask<unknown>> = [];
  private readonly backgroundQueue: Array<QueuedTask<unknown>> = [];
  private readonly idleResolvers: Array<() => void> = [];

  runInteractive<T>(
    task: (context: ModelTaskContext) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    return this.enqueue("interactive", task, signal);
  }

  runBackground<T>(
    task: (context: ModelTaskContext) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    return this.enqueue("background", task, signal);
  }

  cancelBackground(): void {
    const pending = this.backgroundQueue.splice(0);
    for (const item of pending) item.reject(abortError());
    this.notifyIdle();
  }

  async waitForIdle(): Promise<void> {
    if (!this.running && this.interactiveQueue.length === 0 && this.backgroundQueue.length === 0) return;
    await new Promise<void>((resolve) => this.idleResolvers.push(resolve));
  }

  private enqueue<T>(
    priority: ModelTaskPriority,
    task: (context: ModelTaskContext) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise<T>((resolve, reject) => {
      const item: QueuedTask<T> = { priority, task, signal, resolve, reject };
      const onAbort = () => {
        const queue = priority === "interactive" ? this.interactiveQueue : this.backgroundQueue;
        const index = queue.indexOf(item as QueuedTask<unknown>);
        if (index >= 0) {
          queue.splice(index, 1);
          reject(abortError());
          this.notifyIdle();
        }
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      if (priority === "interactive") this.interactiveQueue.push(item as QueuedTask<unknown>);
      else this.backgroundQueue.push(item as QueuedTask<unknown>);
      void this.pump();
    });
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    const next = this.interactiveQueue.shift() ?? this.backgroundQueue.shift();
    if (!next) {
      this.notifyIdle();
      return;
    }
    if (next.signal?.aborted) {
      next.reject(abortError());
      void this.pump();
      return;
    }
    this.running = true;
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    next.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const result = await next.task({ signal: controller.signal });
      next.resolve(result);
    } catch (error) {
      next.reject(error);
    } finally {
      next.signal?.removeEventListener("abort", onAbort);
      this.running = false;
      void this.pump();
    }
  }

  private notifyIdle(): void {
    if (this.running || this.interactiveQueue.length > 0 || this.backgroundQueue.length > 0) return;
    const resolvers = this.idleResolvers.splice(0);
    for (const resolve of resolvers) resolve();
  }
}

export const modelTaskScheduler = new ModelTaskScheduler();
