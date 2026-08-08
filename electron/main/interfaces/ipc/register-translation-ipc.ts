import { IPC_CHANNELS, type DictionaryContextRequest, type SegmentAlternativeRequest, type SegmentRevisionRequest, type TranslationRequest } from "../../../shared/types";
import { parseDictionaryContextRequest, parseId, parseSegmentAlternativeRequest, parseSegmentRevisionRequest, parseTranslationRequest } from "../../ipc/validation";
import { registerInvoke, registerOn } from "./helpers";
import type { IpcDependencies } from "./types";

export function registerTranslationIpc(dependencies: IpcDependencies): void {
  const { translationManager, translationSessionStore, windowManager } = dependencies;

  registerInvoke(IPC_CHANNELS.translationSessionGet, () => translationSessionStore.getActive());
  registerInvoke(IPC_CHANNELS.translationOpenHistory, async (_event, historyId: string) => {
    const id = parseId(historyId, "历史 ID");
    const mainWindow = await windowManager.showMainWindow("/");
    return translationManager.openHistorySession(mainWindow.webContents, id);
  });
  registerInvoke(IPC_CHANNELS.translationStart, (event, request: TranslationRequest) => translationManager.start(event.sender, parseTranslationRequest(request)));
  registerOn(IPC_CHANNELS.translationCancel, (_event, requestId?: string) => translationManager.cancel(requestId === undefined ? undefined : parseId(requestId, "请求 ID")));
  registerInvoke(IPC_CHANNELS.revisionStart, (event, request: SegmentRevisionRequest) => translationManager.revise(event.sender, parseSegmentRevisionRequest(request)));
  registerOn(IPC_CHANNELS.revisionCancel, (_event, requestId?: string) => translationManager.cancel(requestId === undefined ? undefined : parseId(requestId, "请求 ID")));
  registerInvoke(IPC_CHANNELS.alternativesStart, (event, request: SegmentAlternativeRequest) => translationManager.alternatives(event.sender, parseSegmentAlternativeRequest(request)));
  registerOn(IPC_CHANNELS.alternativesCancel, (_event, requestId?: string) => translationManager.cancel(requestId === undefined ? undefined : parseId(requestId, "请求 ID")));
  registerInvoke(IPC_CHANNELS.dictionaryContextStart, (event, request: DictionaryContextRequest) => translationManager.explainDictionary(event.sender, parseDictionaryContextRequest(request)));
  registerOn(IPC_CHANNELS.dictionaryContextCancel, (_event, requestId?: string) => translationManager.cancel(requestId === undefined ? undefined : parseId(requestId, "请求 ID")));
}
