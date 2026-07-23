import { app } from "electron";
import type { AppSettings, TranslationMode } from "../../shared/types";
import { captureSelectedText } from "../clipboard/selection";
import { HotkeyManager } from "../hotkey/manager";
import { registerIpcHandlers } from "../ipc/register";
import { HistoryStore } from "../storage/history";
import { SettingsStore } from "../storage/settings";
import { TranslationManager } from "../translation/manager";
import { TrayManager } from "../tray/manager";
import { WindowManager } from "../window/manager";

export async function bootstrapApplication(): Promise<void> {
  await app.whenReady();

  const settingsStore = new SettingsStore();
  const historyStore = new HistoryStore();
  await Promise.all([settingsStore.initialize(), historyStore.initialize()]);

  const windowManager = new WindowManager(
    () => settingsStore.get().window.closeAction,
    () => settingsStore.get().window.autoHidePopup
  );
  const translationManager = new TranslationManager(settingsStore, historyStore);

  const triggerSelection = async (mode: TranslationMode): Promise<void> => {
    await windowManager.showPopup({ mode, capturing: true });
    translationManager.cancel();
    const selection = await captureSelectedText(settingsStore.get().translation.maxInputLength);
    await windowManager.showPopup({ mode, text: selection.text, error: selection.error });
  };

  const hotkeyManager = new HotkeyManager((mode) => void triggerSelection(mode));
  let trayManager: TrayManager;

  const applySettings = (settings: AppSettings) => {
    app.setLoginItemSettings({ openAtLogin: settings.startup.enabled });
    const shortcutResult = hotkeyManager.register(settings.shortcuts);
    trayManager.update(settings.shortcuts);
    return shortcutResult;
  };

  trayManager = new TrayManager({
    openMain: () => void windowManager.showMainWindow(),
    quickTranslate: () => void triggerSelection("technical"),
    naming: () => void triggerSelection("naming"),
    openSettings: () => void windowManager.showMainWindow("/settings"),
    togglePaused: (paused) => {
      const settings = settingsStore.get();
      settings.shortcuts.paused = paused;
      void settingsStore.update(settings).then(() => applySettings(settingsStore.get()));
    },
    quit: () => app.quit()
  });

  trayManager.create(settingsStore.get().shortcuts);
  applySettings(settingsStore.get());
  registerIpcHandlers({
    settingsStore,
    historyStore,
    translationManager,
    windowManager,
    applySettings
  });

  await windowManager.ensurePopupWindow();
  if (process.env.LEXIFLOW_E2E === "1") await windowManager.showMainWindow();

  app.on("activate", () => void windowManager.showMainWindow());
  app.on("second-instance", () => void windowManager.showMainWindow());
  app.on("before-quit", () => {
    windowManager.setQuitting(true);
    translationManager.cancel();
    hotkeyManager.unregister();
    trayManager.destroy();
  });

  // LexiFlow is a tray application, so closing every window must not end the process.
  app.on("window-all-closed", () => undefined);
}
