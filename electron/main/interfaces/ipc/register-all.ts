import { registerDictionaryIpc } from "./register-dictionary-ipc";
import { registerDocumentIpc } from "./register-document-ipc";
import { registerGlossaryIpc } from "./register-glossary-ipc";
import { registerHistoryIpc } from "./register-history-ipc";
import { registerOcrIpc } from "./register-ocr-ipc";
import { registerProfileIpc } from "./register-profile-ipc";
import { registerRuntimeIpc } from "./register-runtime-ipc";
import { registerSettingsIpc } from "./register-settings-ipc";
import { registerTranslationIpc } from "./register-translation-ipc";
import { registerWindowIpc } from "./register-window-ipc";
import type { IpcDependencies } from "./types";

/** Single composition boundary for all domain IPC registrars. */
export function registerAllIpc(dependencies: IpcDependencies): void {
  registerRuntimeIpc(dependencies);
  registerSettingsIpc(dependencies);
  registerTranslationIpc(dependencies);
  registerHistoryIpc(dependencies);
  registerDictionaryIpc(dependencies);
  registerGlossaryIpc(dependencies);
  registerProfileIpc(dependencies);
  registerDocumentIpc(dependencies);
  registerOcrIpc(dependencies);
  registerWindowIpc(dependencies);
}

export type { IpcDependencies } from "./types";
