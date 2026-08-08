export type DocumentTaskStatus = "created" | "parsing" | "translating" | "paused" | "completed" | "failed" | "cancelled";
export interface DocumentTask { id: string; fileName: string; format: "txt" | "markdown" | "srt" | "pdf" | "code"; totalChunks: number; completedChunks: number; status: DocumentTaskStatus; profileId: string; model: string; promptVersion: string; createdAt: number; updatedAt: number; error?: string; }
export interface DocumentChunkFailure { error: string; retryable: boolean; failedAt: number; }
export interface DocumentTaskRecord extends DocumentTask {
  sourcePath: string;
  chunks: Array<{ id: string; source: string; translatable: boolean; prefix?: string; suffix?: string }>;
  translations: Record<string, string>;
  failedChunks?: Record<string, DocumentChunkFailure>;
}
export interface DocumentImportRequest { profileId: string; }
export interface DocumentExportRequest { taskId: string; format: "translated" | "bilingual" | "json"; }
export interface DocumentTaskEvent { task: DocumentTaskRecord; }
