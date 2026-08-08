import { IPC_CHANNELS } from "../../../shared/types";
import { parseDocumentExportRequest, parseDocumentImportRequest, parseId } from "../../ipc/validation";
import { registerInvoke } from "./helpers";
import type { IpcDependencies } from "./types";

export function registerDocumentIpc(dependencies: IpcDependencies): void {
  const { documentManager } = dependencies;
  registerInvoke(IPC_CHANNELS.documentList, () => documentManager.list());
  registerInvoke(IPC_CHANNELS.documentDelete, (_event, id: string) => documentManager.delete(parseId(id, "任务 ID")));
  registerInvoke(IPC_CHANNELS.documentImport, (event, request: unknown) => documentManager.import(event.sender, parseDocumentImportRequest(request)));
  registerInvoke(IPC_CHANNELS.documentExport, (event, request: unknown) => documentManager.export(event.sender, parseDocumentExportRequest(request)));
  registerInvoke(IPC_CHANNELS.documentStart, (event, taskId: string) => documentManager.start(event.sender, parseId(taskId, "任务 ID")));
  registerInvoke(IPC_CHANNELS.documentPause, (_event, taskId: string) => documentManager.pause(parseId(taskId, "任务 ID")));
  registerInvoke(IPC_CHANNELS.documentCancel, (_event, taskId: string) => documentManager.cancel(parseId(taskId, "任务 ID")));
}
