import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getLocale: () => "zh-CN",
    getPath: () => "C:\\Users\\test\\AppData\\Roaming\\lexiflow"
  }
}));

import { buildDiagnosticReport } from "../electron/main/core/diagnostics";
import { recordStructuredParseFailure, resetStructuredParseFailureCounts } from "../electron/main/core/structured";

describe("脱敏诊断导出", () => {
  it("只包含运行环境与匿名计数，不含正文或密钥字段", () => {
    resetStructuredParseFailureCounts();
    recordStructuredParseFailure("segments", "invalid-json");
    const report = buildDiagnosticReport("0.1.0");
    expect(report.schemaVersion).toBe(1);
    expect(report.appVersion).toBe("0.1.0");
    expect(report.structuredParseFailures).toEqual({ "segments:invalid-json": 1 });
    expect(report.nonFatalErrors).toEqual({});
    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/apiKey|sourceText|targetText|password/i);
    expect(report.notes.some((note) => note.includes("不含原文"))).toBe(true);
  });
});
