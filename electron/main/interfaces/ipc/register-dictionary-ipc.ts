import { IPC_CHANNELS } from "../../../shared/types";
import { parseDictionaryLookupRequest } from "../../ipc/validation";
import { registerInvoke } from "./helpers";
import type { IpcDependencies } from "./types";

export function registerDictionaryIpc(dependencies: IpcDependencies): void {
  const { dictionaryService } = dependencies;
  registerInvoke(IPC_CHANNELS.dictionaryLookup, (_event, request: unknown) => dictionaryService.lookup(parseDictionaryLookupRequest(request)));
  registerInvoke(IPC_CHANNELS.dictionaryStatus, () => dictionaryService.getStatus());
}
