/**
 * 兼容旧单测的交互/文档互斥门。生产路径请使用 ModelTaskScheduler。
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
