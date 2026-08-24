import { IPC_CHANNELS } from "../../../shared/types";
import { parseId, parseVocabularyUpsertInput } from "../../ipc/validation";
import { registerInvoke } from "./helpers";
import type { IpcDependencies } from "./types";

export function registerVocabularyIpc(dependencies: IpcDependencies): void {
  const { vocabularyService } = dependencies;
  registerInvoke(IPC_CHANNELS.vocabularyList, () => vocabularyService.list());
  registerInvoke(IPC_CHANNELS.vocabularyUpsert, (_event, input: unknown) => vocabularyService.upsert(parseVocabularyUpsertInput(input)));
  registerInvoke(IPC_CHANNELS.vocabularyDelete, (_event, id: unknown) => vocabularyService.delete(parseId(id, "生词 ID")));
  registerInvoke(IPC_CHANNELS.vocabularyClear, () => vocabularyService.clear());
}
