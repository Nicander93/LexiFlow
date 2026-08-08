import { randomUUID } from "node:crypto";
import { basename, extname } from "node:path";
import { readFile } from "node:fs/promises";
import { dialog, BrowserWindow } from "electron";
import { PDFParse } from "pdf-parse";
import type { DocumentImportRequest, DocumentTaskRecord } from "../../shared/types";
import { PROMPT_VERSION } from "../../shared/defaults";
import { chunkDocument, type DocumentFormat } from "./chunking";
import type { DocumentStore } from "../storage/documents";
import type { ProfileStore } from "../storage/profiles";

const FORMAT_BY_EXTENSION: Record<string, DocumentFormat | undefined> = { ".txt": "txt", ".md": "markdown", ".markdown": "markdown", ".srt": "srt", ".pdf": "pdf", ".ts": "code", ".tsx": "code", ".js": "code", ".jsx": "code", ".py": "code", ".java": "code", ".json": "code", ".yaml": "code", ".yml": "code", ".toml": "code", ".ini": "code", ".properties": "code" };

export async function extractPdfText(sourcePath: string): Promise<string> {
  const parser = new PDFParse({ data: await readFile(sourcePath) });
  try {
    const result = await parser.getText();
    const text = result.text.trim();
    if (!text) throw new Error("该 PDF 未包含可提取文本；扫描件请先使用 OCR。");
    return text;
  } finally {
    await parser.destroy();
  }
}

export class DocumentImportService {
  constructor(private readonly store: DocumentStore, private readonly profiles: ProfileStore) {}

  async import(sender: Electron.WebContents, request: DocumentImportRequest): Promise<DocumentTaskRecord | undefined> {
    const options: Electron.OpenDialogOptions = { title: "选择待翻译文档", properties: ["openFile"], filters: [{ name: "文档与代码预览", extensions: ["txt", "md", "markdown", "srt", "pdf", "ts", "tsx", "js", "jsx", "py", "java", "json", "yaml", "yml", "toml", "ini", "properties"] }] };
    const parent = BrowserWindow.fromWebContents(sender);
    const selected = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    if (selected.canceled || !selected.filePaths[0]) return undefined;
    const sourcePath = selected.filePaths[0];
    const format = FORMAT_BY_EXTENSION[extname(sourcePath).toLowerCase()];
    if (!format) throw new Error("仅支持 TXT、Markdown、SRT、纯文本 PDF 及常见代码/配置文件。");
    const profile = this.profiles.get(request.profileId);
    if (!profile) throw new Error("所选 Profile 不存在。");
    const source = format === "pdf" ? await extractPdfText(sourcePath) : await readFile(sourcePath, "utf8");
    const now = Date.now();
    const chunks = chunkDocument(source, format);
    return this.store.upsert({
      id: randomUUID(),
      fileName: basename(sourcePath),
      sourcePath,
      format,
      totalChunks: chunks.filter((chunk) => chunk.translatable).length,
      completedChunks: 0,
      status: "created",
      profileId: profile.id,
      model: profile.modelId ?? "default",
      promptVersion: PROMPT_VERSION,
      createdAt: now,
      updatedAt: now,
      chunks,
      translations: {},
      failedChunks: {}
    });
  }
}

