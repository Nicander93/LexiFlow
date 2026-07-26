import { describe, expect, it } from "vitest";
import { ModelRequestGate } from "../electron/main/core/model-request-gate";

describe("模型请求门禁队列", () => {
  it("交互请求优先，文档任务需等待并在取消时释放", async () => {
    const gate = new ModelRequestGate();
    const controller = new AbortController();
    gate.beginInteractive();

    let acquired = false;
    const pending = gate.acquireDocument(controller.signal).then(() => {
      acquired = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(acquired).toBe(false);

    gate.endInteractive();
    await pending;
    expect(acquired).toBe(true);

    gate.releaseDocument();

    const cancelled = new AbortController();
    gate.beginInteractive();
    const waiting = gate.acquireDocument(cancelled.signal);
    cancelled.abort();
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    gate.endInteractive();
  });

  it("文档执行中会为交互请求让出", async () => {
    const gate = new ModelRequestGate();
    const controller = new AbortController();
    await gate.acquireDocument(controller.signal);
    gate.beginInteractive();

    let yielded = false;
    const yieldPromise = gate.yieldForInteractive(controller.signal).then(() => {
      yielded = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(yielded).toBe(false);
    gate.endInteractive();
    await yieldPromise;
    expect(yielded).toBe(true);
    gate.releaseDocument();
  });
});
