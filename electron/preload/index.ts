import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  type AppSettings,
  type PopupPayload,
  type ProviderHealth,
  type RuntimeInfo,
  type SelectionResult,
  type ShortcutRegistrationResult,
  type TranslationEvent,
  type TranslationHistory,
  type TranslationRequest
} from "../shared/types";
import type { TranslatorApi } from "../shared/api";

const on = <T>(channel: string, listener: (payload: T) => void): (() => void) => {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

const api = {
  runtime: {
    ping: (): Promise<RuntimeInfo> => ipcRenderer.invoke(IPC_CHANNELS.runtimePing)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
    update: (settings: AppSettings): Promise<{
      settings: AppSettings;
      shortcutResult: ShortcutRegistrationResult;
    }> => ipcRenderer.invoke(IPC_CHANNELS.settingsUpdate, settings)
  },
  provider: {
    healthCheck: (): Promise<ProviderHealth> => ipcRenderer.invoke(IPC_CHANNELS.providerHealth),
    getModels: () => ipcRenderer.invoke(IPC_CHANNELS.providerModels)
  },
  translation: {
    start: (request: TranslationRequest): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.translationStart, request),
    cancel: (requestId?: string): void => ipcRenderer.send(IPC_CHANNELS.translationCancel, requestId),
    onEvent: (listener: (event: TranslationEvent) => void): (() => void) =>
      on(IPC_CHANNELS.translationEvent, listener)
  },
  selection: {
    capture: (): Promise<SelectionResult> => ipcRenderer.invoke(IPC_CHANNELS.selectionCapture)
  },
  history: {
    list: (): Promise<TranslationHistory[]> => ipcRenderer.invoke(IPC_CHANNELS.historyList),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.historyDelete, id),
    clear: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.historyClear)
  },
  clipboard: {
    writeText: (text: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.clipboardWrite, text)
  },
  window: {
    openMain: (route?: string): void => ipcRenderer.send(IPC_CHANNELS.windowOpenMain, route),
    closePopup: (): void => ipcRenderer.send(IPC_CHANNELS.popupClose),
    pinPopup: (pinned: boolean): void => ipcRenderer.send(IPC_CHANNELS.popupPin, pinned),
    onPopupPayload: (listener: (payload: PopupPayload) => void): (() => void) =>
      on(IPC_CHANNELS.popupPayload, listener),
    onNavigate: (listener: (route: string) => void): (() => void) => on("navigation:open", listener)
  }
} satisfies TranslatorApi;

contextBridge.exposeInMainWorld("translator", api);
