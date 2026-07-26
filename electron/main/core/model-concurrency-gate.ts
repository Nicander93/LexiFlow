/**
 * Coordinates interactive model work vs background document chunks.
 * Interactive (translation / revision / alternatives / dictionary) always wins.
 * 管理模型调用的优先级，保证划词翻译（交互）永远优先于文档后台分块。
 * 交互请求与文档分块抢同一条模型通道；交互永远优先，文档要么等，要么在分块间隙让路。
 */
export class ModelConcurrencyGate {
  private interactive = 0;
  private documentHeld = false;
  private readonly waiters: Array<() => void> = [];

  beginInteractive(): void {
    this.interactive += 1;
  }

  endInteractive(): void {
    this.interactive = Math.max(0, this.interactive - 1);
    this.flush();
  }

  /** Waits until no interactive request is active and no other document holds the slot. 无交互、无其他文档占槽时才能拿到；可被 Abort 打断。 */
  async acquireDocument(signal: AbortSignal): Promise<void> {
    for (;;) {
      if (signal.aborted) throw Object.assign(new Error("Aborted"), { name: "AbortError" });
      if (this.interactive === 0 && !this.documentHeld) {
        this.documentHeld = true;
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          cleanup();
          reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        };
        const wake = () => {
          cleanup();
          resolve();
        };
        const cleanup = () => {
          signal.removeEventListener("abort", onAbort);
          const index = this.waiters.indexOf(wake);
          if (index >= 0) this.waiters.splice(index, 1);
        };
        signal.addEventListener("abort", onAbort, { once: true });
        this.waiters.push(wake);
      });
    }
  }

  releaseDocument(): void {
    this.documentHeld = false;
    this.flush();
  }

  /** Between document chunks: yield while interactive work is running. 分块间隙有交互任务时挂起，避免长文档拖住划词。 */
  async yieldForInteractive(signal: AbortSignal): Promise<void> {
    while (this.interactive > 0) {
      if (signal.aborted) throw Object.assign(new Error("Aborted"), { name: "AbortError" });
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          cleanup();
          reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        };
        const wake = () => {
          cleanup();
          resolve();
        };
        const cleanup = () => {
          signal.removeEventListener("abort", onAbort);
          const index = this.waiters.indexOf(wake);
          if (index >= 0) this.waiters.splice(index, 1);
        };
        signal.addEventListener("abort", onAbort, { once: true });
        this.waiters.push(wake);
      });
    }
  }

  private flush(): void {
    const pending = this.waiters.splice(0);
    for (const wake of pending) wake();
  }
}

export const modelConcurrencyGate = new ModelConcurrencyGate();
