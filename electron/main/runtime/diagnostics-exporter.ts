import { app, dialog } from "electron";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildDiagnosticReport } from "../core/diagnostics";

export class DiagnosticsExporter {
  async export(): Promise<{ saved: boolean; path?: string }> {
    const defaultPath = join(app.getPath("documents"), `lexiflow-diagnostics-${Date.now()}.json`);
    const destination = await dialog.showSaveDialog({ title: "导出诊断信息", defaultPath, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (destination.canceled || !destination.filePath) return { saved: false };
    await writeFile(destination.filePath, JSON.stringify(buildDiagnosticReport(app.getVersion()), null, 2), "utf8");
    return { saved: true, path: destination.filePath };
  }
}
