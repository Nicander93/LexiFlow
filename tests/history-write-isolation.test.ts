import { describe, expect, it, vi } from "vitest";
import { getNonFatalErrorCounts, persistHistorySafely, recordNonFatalError } from "../electron/main/core/non-fatal";

describe("历史写入隔离", () => {
  it("写入成功时不返回 warning", async () => {
    const warning = await persistHistorySafely(async () => undefined);
    expect(warning).toBeUndefined();
  });

  it("写入失败时返回非阻断提示并记录计数，不抛出", async () => {
    const before = getNonFatalErrorCounts()["history-write-failed"] ?? 0;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const warning = await persistHistorySafely(async () => {
      throw new Error("EACCES");
    });
    expect(warning).toBe("翻译成功，但历史记录保存失败。");
    expect(getNonFatalErrorCounts()["history-write-failed"]).toBe(before + 1);
    warnSpy.mockRestore();
  });

  it("recordNonFatalError 累加匿名计数", () => {
    const before = getNonFatalErrorCounts()["test-code"] ?? 0;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    recordNonFatalError("test-code", new Error("boom"));
    expect(getNonFatalErrorCounts()["test-code"]).toBe(before + 1);
    warnSpy.mockRestore();
  });
});
