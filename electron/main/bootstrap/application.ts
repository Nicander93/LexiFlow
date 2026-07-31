/**
 * 应用装配入口：初始化本地 Store → Manager → IPC / 托盘 / 快捷键。
 * 退出时取消模型请求；history.retention === clear-on-exit 时先清历史再真正退出。
 * 托盘应用：window-all-closed 不得结束进程。
 */
import { app, Menu, screen } from "electron";
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
import { TranslationSessionStore } from "../translation/session-store";
import { TrayManager } from "../tray/manager";
import { WindowManager } from "../window/manager";
import { SelectionController } from "../selection/controller";
import { createGlobalMouseHook } from "../selection/uiohook-adapter";

export async function bootstrapApplication(): Promise<void> {
  await app.whenReady();
  Menu.setApplicationMenu(null);

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
  const translationSessionStore = new TranslationSessionStore();
  const translationManager = new TranslationManager(settingsStore, historyStore, glossaryStore, profileStore, translationSessionStore);
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

  const showCapturedSelection = async (text: string): Promise<void> => {
    const profileId = settingsStore.get().shortcuts.defaultTranslationProfileId || "technical";
    translationManager.cancel();
    await windowManager.showPopup({ mode: modeShortcutForProfile(profileId), profileId, text });
  };

  const selectionController = new SelectionController({
    hook: createGlobalMouseHook(),
    capture: () => captureSelectedText(settingsStore.get().translation.maxInputLength),
    normalizePoint: (point) => screen.screenToDipPoint(point),
    showTip: (point) => void windowManager.showSelectionTip(point),
    hideTip: () => windowManager.hideSelectionTip(),
    isTipPoint: (point) => windowManager.isSelectionTipPoint(point),
    onConfirm: (text) => void showCapturedSelection(text)
  });

  const hotkeyManager = new HotkeyManager((action) => {
    if (action === "ocr") void windowManager.requestOcrCapture();
    else if (action === "naming") void triggerSelection("naming");
    else void triggerQuickTranslate();
  });
  let trayManager: TrayManager;

  const applySettings = (settings: AppSettings) => {
    windowManager.setFontSize(settings.window.fontSize);
    const shortcutResult = hotkeyManager.register(settings.shortcuts);
    if (shortcutResult.errors.length) return shortcutResult;
    try {
      selectionController.setEnabled(settings.shortcuts.enableSelectionTranslation);
    } catch {
      shortcutResult.errors.push("无法启用划词监听，请重新安装应用后重试。");
      return shortcutResult;
    }
    app.setLoginItemSettings({ openAtLogin: settings.startup.enabled });
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
      const previous = settingsStore.get();
      const next = structuredClone(previous);
      next.shortcuts.paused = paused;
      const shortcutResult = applySettings(next);
      if (shortcutResult.errors.length) {
        applySettings(previous);
        return;
      }
      void settingsStore.update(next).catch(() => {
        applySettings(previous);
      });
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
    translationSessionStore,
    windowManager,
    applySettings,
    clearLocalData,
    triggerSelectionTip: () => selectionController.confirm(),
    dismissSelectionTip: () => selectionController.dismiss()
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
      selectionController.dispose();
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
