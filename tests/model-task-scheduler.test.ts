import { describe, expect, it } from "vitest";
import { ModelTaskScheduler } from "../electron/main/core/model-task-scheduler";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("ModelTaskScheduler", () => {
  it("交互任务运行时文档任务等待", async () => {
    const scheduler = new ModelTaskScheduler();
    const order: string[] = [];
    const interactive = scheduler.runInteractive(async () => {
      order.push("interactive-start");
      await delay(40);
      order.push("interactive-end");
      return "i";
    });
    const background = scheduler.runBackground(async () => {
      order.push("background");
      return "b";
    });
    await Promise.all([interactive, background]);
    expect(order).toEqual(["interactive-start", "interactive-end", "background"]);
  });

  it("文档分块完成后交互优先于下一个分块", async () => {
    const scheduler = new ModelTaskScheduler();
    const order: string[] = [];
    const chunk1 = scheduler.runBackground(async () => {
      order.push("chunk-1");
      await delay(30);
      return 1;
    });
    await delay(5);
    const interactive = scheduler.runInteractive(async () => {
      order.push("interactive");
      return "i";
    });
    const chunk2 = scheduler.runBackground(async () => {
      order.push("chunk-2");
      return 2;
    });
    await Promise.all([chunk1, interactive, chunk2]);
    expect(order).toEqual(["chunk-1", "interactive", "chunk-2"]);
  });

  it("多个交互任务按顺序执行，同一时刻只有一个生成", async () => {
    const scheduler = new ModelTaskScheduler();
    let concurrent = 0;
    let maxConcurrent = 0;
    const run = (label: string) => scheduler.runInteractive(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await delay(15);
      concurrent -= 1;
      return label;
    });
    await Promise.all([run("a"), run("b"), run("c")]);
    expect(maxConcurrent).toBe(1);
  });

  it("取消等待中的后台任务不会残留 waiter", async () => {
    const scheduler = new ModelTaskScheduler();
    const controller = new AbortController();
    const blocked = scheduler.runInteractive(async () => {
      await delay(50);
      return "i";
    });
    const waiting = scheduler.runBackground(async () => "b", controller.signal);
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    await blocked;
    await scheduler.waitForIdle();
  });

  it("任务异常后调度器不会死锁", async () => {
    const scheduler = new ModelTaskScheduler();
    await expect(scheduler.runInteractive(async () => {
      throw new Error("boom");
    })).rejects.toThrow("boom");
    await expect(scheduler.runBackground(async () => "ok")).resolves.toBe("ok");
  });

  it("cancelBackground 取消排队中的文档任务", async () => {
    const scheduler = new ModelTaskScheduler();
    const interactive = scheduler.runInteractive(async () => {
      await delay(40);
      return "i";
    });
    const background = scheduler.runBackground(async () => "b");
    scheduler.cancelBackground();
    await expect(background).rejects.toMatchObject({ name: "AbortError" });
    await interactive;
  });
});
