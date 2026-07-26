import { app } from "electron";
import { getStructuredParseFailureCounts } from "./structured";

export interface DiagnosticReport {
  schemaVersion: 1;
  createdAt: string;
  appVersion: string;
  electron: string;
  platform: string;
  arch: string;
  locale: string;
  userDataPath: string;
  structuredParseFailures: Record<string, number>;
  notes: string[];
}

/** Redacted diagnostics only — never include source/target text, documents, or API keys. 只收集环境与匿名计数。 */
export function buildDiagnosticReport(appVersion: string): DiagnosticReport {
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    appVersion,
    electron: process.versions.electron,
    platform: process.platform,
    arch: process.arch,
    locale: app.getLocale(),
    userDataPath: app.getPath("userData"),
    structuredParseFailures: getStructuredParseFailureCounts(),
    notes: [
      "本报告不含原文、译文、文档内容或 API Key。",
      "structuredParseFailures 仅为匿名计数。"
    ]
  };
}
