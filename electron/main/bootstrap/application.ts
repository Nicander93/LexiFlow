/**
 * 应用装配入口：初始化本地 Store → Manager → IPC / 托盘 / 快捷键。
 * 退出时取消模型请求；history.retention === clear-on-exit 时先清历史再真正退出。
 * 托盘应用：window-all-closed 不得结束进程。
 */
import { app } from "electron";
import type { AppSettings, TranslationMode } from "../../shared/types";
import { captureSelectedText } from "../clipboard/selection";
import { HotkeyManager } from "../hotkey/manager";
import { registerIpcHandlers } from "../ipc/register";
import { HistoryStore } from "../storage/history";
import { DictionaryService } from "../storage/dictionary";
import { GlossaryStore } from "../storage/glossary";
import { ProfileStore } from "../storage/profiles";
import { DocumentStore } from "../storage/documents";
import { DocumentManager } from "../document/manager";
import { WindowsOcrService } from "../ocr/windows-ocr";
import { SettingsStore } from "../storage/settings";
import { TranslationManager } from "../translation/manager";
import { TrayManager } from "../tray/manager";
import { WindowManager } from "../window/manager";

export async function bootstrapApplication(): Promise<void> {
  await app.whenReady();

  const settingsStore = new SettingsStore();
  const historyStore = new HistoryStore();
  const dictionaryService = new DictionaryService();
  const glossaryStore = new GlossaryStore();
  const profileStore = new ProfileStore();
  const documentStore = new DocumentStore();
  await Promise.all([settingsStore.initialize(), historyStore.initialize(), dictionaryService.initialize(), glossaryStore.initialize(), profileStore.initialize(), documentStore.initialize()]);
  await historyStore.prune(settingsStore.get().history);

  const windowManager = new WindowManager(
    () => settingsStore.get().window.closeAction,
    () => settingsStore.get().window.autoHidePopup
  );
  const translationManager = new TranslationManager(settingsStore, historyStore, glossaryStore, profileStore);
  const documentManager = new DocumentManager(documentStore, profileStore, settingsStore, glossaryStore);
  const ocrService = new WindowsOcrService();

  const triggerSelection = async (mode: TranslationMode): Promise<void> => {
    await windowManager.showPopup({ mode, capturing: true });
    translationManager.cancel();
    const selection = await captureSelectedText(settingsStore.get().translation.maxInputLength);
    await windowManager.showPopup({ mode, text: selection.text, error: selection.error });
  };

  const hotkeyManager = new HotkeyManager((action) => {
    if (action === "ocr") void windowManager.requestOcrCapture();
    else void triggerSelection(action);
  });
  let trayManager: TrayManager;

  const applySettings = (settings: AppSettings) => {
    app.setLoginItemSettings({ openAtLogin: settings.startup.enabled });
    const shortcutResult = hotkeyManager.register(settings.shortcuts);
    trayManager.update(settings.shortcuts);
    return shortcutResult;
  };
  const clearLocalData = async (): Promise<void> => {
    translationManager.cancel();
    await Promise.all([historyStore.clear(), dictionaryService.clear(), glossaryStore.clear(), profileStore.clear(), documentStore.clear(), settingsStore.reset()]);
    applySettings(settingsStore.get());
  };

  trayManager = new TrayManager({
    openMain: () => void windowManager.showMainWindow(),
    quickTranslate: () => void triggerSelection("technical"),
    naming: () => void triggerSelection("naming"),
    screenshot: () => void windowManager.requestOcrCapture(),
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
    dictionaryService,
    glossaryStore,
    profileStore,
    documentStore,
    documentManager,
    ocrService,
    translationManager,
    windowManager,
    applySettings,
    clearLocalData
  });

  await windowManager.ensurePopupWindow();
  if (process.env.LEXIFLOW_E2E === "1") await windowManager.showMainWindow();

  app.on("activate", () => void windowManager.showMainWindow());
  app.on("second-instance", () => void windowManager.showMainWindow());
  let clearingExitHistory = false;
  app.on("before-quit", (event) => {
    if (settingsStore.get().history.retention === "clear-on-exit" && !clearingExitHistory) {
      event.preventDefault();
      clearingExitHistory = true;
      void historyStore.clear().finally(() => app.quit());
      return;
    }
    windowManager.setQuitting(true);
    translationManager.cancel();
    hotkeyManager.unregister();
    trayManager.destroy();
  });

  // LexiFlow is a tray application, so closing every window must not end the process.
  app.on("window-all-closed", () => undefined);
}
