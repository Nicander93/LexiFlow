import { app, clipboard, ipcMain } from "electron";
import { captureSelectedText } from "../clipboard/selection";
import { validateSettings } from "../core/settings-validation";
import { createProvider } from "../provider";
import type { HistoryStore } from "../storage/history";
import type { SettingsStore } from "../storage/settings";
import type { TranslationManager } from "../translation/manager";
import type { WindowManager } from "../window/manager";
import {
  IPC_CHANNELS,
  type AppSettings,
  type TranslationRequest
} from "../../shared/types";

interface IpcDependencies {
  settingsStore: SettingsStore;
  historyStore: HistoryStore;
  translationManager: TranslationManager;
  windowManager: WindowManager;
  applySettings: (settings: AppSettings) => unknown;
}

export function registerIpcHandlers(dependencies: IpcDependencies): void {
  const { settingsStore, historyStore, translationManager, windowManager } = dependencies;

  ipcMain.handle(IPC_CHANNELS.runtimePing, () => ({
    apiVersion: 1 as const,
    electron: process.versions.electron,
    platform: process.platform
  }));
  ipcMain.handle(IPC_CHANNELS.settingsGet, () => settingsStore.getPublic());
  ipcMain.handle(IPC_CHANNELS.settingsUpdate, async (_event, settings: AppSettings) => {
    const errors = validateSettings(settings);
    if (errors.length) throw new Error(errors.join("\n"));
    const updated = await settingsStore.update(settings);
    return { settings: updated, shortcutResult: dependencies.applySettings(settingsStore.get()) };
  });
  ipcMain.handle(IPC_CHANNELS.providerHealth, async () => {
    return createProvider(settingsStore.get()).healthCheck();
  });
  ipcMain.handle(IPC_CHANNELS.providerModels, async () => {
    return createProvider(settingsStore.get()).getModels();
  });
  ipcMain.handle(IPC_CHANNELS.translationStart, (event, request: TranslationRequest) => {
    return translationManager.start(event.sender, request);
  });
  ipcMain.on(IPC_CHANNELS.translationCancel, (_event, requestId?: string) => {
    translationManager.cancel(requestId);
  });
  ipcMain.handle(IPC_CHANNELS.selectionCapture, () => {
    return captureSelectedText(settingsStore.get().translation.maxInputLength);
  });
  ipcMain.handle(IPC_CHANNELS.historyList, () => historyStore.list());
  ipcMain.handle(IPC_CHANNELS.historyDelete, (_event, id: string) => historyStore.delete(id));
  ipcMain.handle(IPC_CHANNELS.historyClear, () => historyStore.clear());
  ipcMain.handle(IPC_CHANNELS.clipboardWrite, (_event, text: string) => clipboard.writeText(text));
  ipcMain.on(IPC_CHANNELS.windowOpenMain, (_event, route?: string) => {
    void windowManager.showMainWindow(route);
  });
  ipcMain.on(IPC_CHANNELS.popupClose, () => {
    translationManager.cancel();
    windowManager.hidePopup();
  });
  ipcMain.on(IPC_CHANNELS.popupPin, (_event, pinned: boolean) => {
    windowManager.setPopupPinned(pinned);
  });

  app.on("before-quit", () => translationManager.cancel());
}
