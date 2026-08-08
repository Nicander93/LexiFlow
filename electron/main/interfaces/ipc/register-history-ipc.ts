import { IPC_CHANNELS } from "../../../shared/types";
import { parseHistoryRevisionUpdate, parseId, parseString } from "../../ipc/validation";
import { registerInvoke } from "./helpers";
import type { IpcDependencies } from "./types";

export function registerHistoryIpc(dependencies: IpcDependencies): void {
  const { historyService } = dependencies;
  registerInvoke(IPC_CHANNELS.historyList, () => historyService.list());
  registerInvoke(IPC_CHANNELS.historyGet, (_event, id: string) => historyService.get(parseId(id, "历史 ID")));
  registerInvoke(IPC_CHANNELS.historySearch, (_event, query: string) => historyService.search(parseString(query, "搜索词", 1_000)));
  registerInvoke(IPC_CHANNELS.historyToggleFavorite, (_event, id: string) => historyService.toggleFavorite(parseId(id, "历史 ID")));
  registerInvoke(IPC_CHANNELS.historyUpdateRevisions, (_event, value: unknown) => historyService.updateRevisions(parseHistoryRevisionUpdate(value)));
  registerInvoke(IPC_CHANNELS.historyDelete, (_event, id: string) => historyService.delete(parseId(id, "历史 ID")));
  registerInvoke(IPC_CHANNELS.historyClear, () => historyService.clear());
}
