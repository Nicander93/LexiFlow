import { IPC_CHANNELS } from "../../../shared/types";
import { parseGlossaryEntry, parseId } from "../../ipc/validation";
import { registerInvoke } from "./helpers";
import type { IpcDependencies } from "./types";

export function registerGlossaryIpc(dependencies: IpcDependencies): void {
  const { glossaryService } = dependencies;
  registerInvoke(IPC_CHANNELS.glossaryList, () => glossaryService.list());
  registerInvoke(IPC_CHANNELS.glossaryUpsert, (_event, entry: unknown) => glossaryService.upsert(parseGlossaryEntry(entry)));
  registerInvoke(IPC_CHANNELS.glossaryDelete, (_event, id: string) => glossaryService.delete(parseId(id, "术语 ID")));
  registerInvoke(IPC_CHANNELS.glossaryConflicts, () => glossaryService.conflicts());
  registerInvoke(IPC_CHANNELS.glossaryImportCsv, () => glossaryService.importCsv());
  registerInvoke(IPC_CHANNELS.glossaryExportCsv, () => glossaryService.exportCsv());
}
