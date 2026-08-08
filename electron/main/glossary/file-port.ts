import { app, dialog } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GlossaryFilePort } from "../application/glossary/glossary-service";

export class ElectronGlossaryFilePort implements GlossaryFilePort {
  async readCsv(): Promise<string | undefined> {
    const selection = await dialog.showOpenDialog({ title: "导入术语表 CSV", properties: ["openFile"], filters: [{ name: "CSV 文件", extensions: ["csv"] }] });
    if (selection.canceled || !selection.filePaths[0]) return undefined;
    return readFile(selection.filePaths[0], "utf8");
  }

  async writeCsv(content: string): Promise<boolean> {
    const defaultPath = join(app.getPath("documents"), "lexiflow-glossary.csv");
    const destination = await dialog.showSaveDialog({ title: "导出术语表 CSV", defaultPath, filters: [{ name: "CSV 文件", extensions: ["csv"] }] });
    if (destination.canceled || !destination.filePath) return false;
    await writeFile(destination.filePath, content, "utf8");
    return true;
  }
}
