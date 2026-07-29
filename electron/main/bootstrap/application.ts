/**
 * 应用装配入口：初始化本地 Store → Manager → IPC / 托盘 / 快捷键。
 * 退出时取消模型请求；history.retention === clear-on-exit 时先清历史再真正退出。
 * 托盘应用：window-all-closed 不得结束进程。
 */
import { app } from "electron";
import type { AppSettings, TranslationMode } from "../../shared/types";
import { captureSelectedText } from "../clipboard/selection";
import { modeShortcutForProfile } from "../core/translation-policy";
import { HotkeyManager } from "../hotkey/manager";
import { registerIpcHandlers } from "../ipc/register";
import { HistoryStore } from "../storage/history";
import { DictionaryService } from "../dictionary/dictionary-service";
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
  await Promise.all([settingsStore.initialize(), historyStore.initialize(), glossaryStore.initialize(), profileStore.initialize(), documentStore.initialize()]);
  await dictionaryService.initialize().catch(() => undefined);
  await historyStore.prune(settingsStore.get().history);

  const windowManager = new WindowManager(
    () => settingsStore.get().window.closeAction,
    () => settingsStore.get().window.autoHidePopup,
    () => settingsStore.get().window.popupBounds,
    (bounds) => {
      const settings = settingsStore.get();
      settings.window.popupBounds = bounds;
      void settingsStore.update(settings);
    }
  );
  const translationManager = new TranslationManager(settingsStore, historyStore, glossaryStore, profileStore);
  const documentManager = new DocumentManager(documentStore, profileStore, settingsStore, glossaryStore);
  const ocrService = new WindowsOcrService();

  const triggerSelection = async (mode: TranslationMode, profileId?: string): Promise<void> => {
    const resolvedProfileId = mode === "naming"
      ? undefined
      : (profileId ?? settingsStore.get().shortcuts.defaultTranslationProfileId) || "technical";
    await windowManager.showPopup({ mode, profileId: resolvedProfileId, capturing: true });
    translationManager.cancel();
    const selection = await captureSelectedText(settingsStore.get().translation.maxInputLength);
    await windowManager.showPopup({ mode, profileId: resolvedProfileId, text: selection.text, error: selection.error });
  };

  const triggerQuickTranslate = async (): Promise<void> => {
    const profileId = settingsStore.get().shortcuts.defaultTranslationProfileId || "technical";
    await triggerSelection(modeShortcutForProfile(profileId), profileId);
  };

  const hotkeyManager = new HotkeyManager((action) => {
    if (action === "ocr") void windowManager.requestOcrCapture();
    else if (action === "naming") void triggerSelection("naming");
    else void triggerQuickTranslate();
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
    await documentManager.cancelAll();
    await Promise.all([historyStore.clear(), glossaryStore.clear(), profileStore.clear(), documentStore.clear(), settingsStore.reset()]);
    documentManager.resumeAccepting();
    applySettings(settingsStore.get());
  };

  trayManager = new TrayManager({
    openMain: () => void windowManager.showMainWindow(),
    quickTranslate: () => void triggerQuickTranslate(),
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
  let disposingOnQuit = false;
  app.on("before-quit", (event) => {
    if (disposingOnQuit) {
      windowManager.setQuitting(true);
      dictionaryService.close();
      hotkeyManager.unregister();
      trayManager.destroy();
      return;
    }
    event.preventDefault();
    disposingOnQuit = true;
    void (async () => {
      translationManager.cancel();
      await documentManager.dispose();
      if (settingsStore.get().history.retention === "clear-on-exit" && !clearingExitHistory) {
        clearingExitHistory = true;
        await historyStore.clear().catch(() => undefined);
      }
      app.quit();
    })();
  });

  // LexiFlow is a tray application, so closing every window must not end the process.
  app.on("window-all-closed", () => undefined);
}
