/**
 * 应用装配入口：初始化本地 Store → Manager → IPC / 托盘 / 快捷键。
 * 退出时取消模型请求；history.retention === clear-on-exit 时先清历史再真正退出。
 * 托盘应用：window-all-closed 不得结束进程。
 */
import { app, clipboard, Menu, screen } from "electron";
import type { AppSettings, TranslationMode } from "../../shared/types";
import { captureSelectedText } from "../clipboard/selection";
import { RuntimeService } from "../application/runtime/runtime-service";
import { HistoryService } from "../application/history/history-service";
import { GlossaryService } from "../application/glossary/glossary-service";
import { ProfileService } from "../application/profile/profile-service";
import { SettingsUseCases } from "../application/settings/settings-use-cases";
import { modeShortcutForProfile } from "../core/translation-policy";
import { HotkeyManager } from "../hotkey/manager";
import { registerAllIpc } from "../interfaces/ipc/register-all";
import { HistoryStore } from "../storage/history";
import { DictionaryService } from "../dictionary/dictionary-service";
import { GlossaryStore, exportGlossaryCsv, parseGlossaryCsv } from "../storage/glossary";
import { ProfileStore } from "../storage/profiles";
import { DocumentStore } from "../storage/documents";
import { DocumentManager } from "../document/manager";
import { WindowsOcrService } from "../ocr/windows-ocr";
import { SettingsStore } from "../storage/settings";
import { SettingsService } from "../application/settings/settings-service";
import { TranslationManager } from "../translation/manager";
import { TranslationSessionStore } from "../translation/session-store";
import { TranslationEngine } from "../application/translation/translation-engine";
import { TrayManager } from "../tray/manager";
import { WindowManager } from "../window/manager";
import { SelectionController } from "../selection/controller";
import { createGlobalMouseHook } from "../selection/uiohook-adapter";
import { DiagnosticsExporter } from "../runtime/diagnostics-exporter";
import { ElectronGlossaryFilePort } from "../glossary/file-port";
import { createProvider } from "../provider";
import { VocabularyStore } from "../storage/vocabulary";
import { VocabularyService } from "../application/vocabulary/vocabulary-service";

export async function bootstrapApplication(): Promise<void> {
  await app.whenReady();
  Menu.setApplicationMenu(null);

  const settingsStore = new SettingsStore();
  const settingsService = new SettingsService(settingsStore);
  const historyStore = new HistoryStore();
  const dictionaryService = new DictionaryService();
  const glossaryStore = new GlossaryStore();
  const profileStore = new ProfileStore();
  const documentStore = new DocumentStore();
  const vocabularyStore = new VocabularyStore();
  const historyService = new HistoryService(historyStore);
  const glossaryService = new GlossaryService(glossaryStore, new ElectronGlossaryFilePort(), { parse: parseGlossaryCsv, serialize: exportGlossaryCsv });
  const profileService = new ProfileService(profileStore);
  const diagnosticsExporter = new DiagnosticsExporter();
  const vocabularyService = new VocabularyService(vocabularyStore);
  await Promise.all([settingsStore.initialize(), historyStore.initialize(), glossaryStore.initialize(), profileStore.initialize(), documentStore.initialize(), vocabularyStore.initialize()]);
  await dictionaryService.initialize().catch(() => undefined);
  await historyStore.prune(settingsStore.get().history);

  const windowManager = new WindowManager(
    () => settingsStore.get().window.closeAction,
    () => settingsStore.get().window.autoHidePopup,
    () => settingsStore.get().window.popupBounds,
    (bounds) => {
      void settingsUseCases.patch({ type: "update-window", value: { popupBounds: bounds } });
    }
  );
  const translationSessionStore = new TranslationSessionStore();
  const createGateway = (settings: AppSettings) => createProvider(settings);
  const translationEngine = new TranslationEngine({
    getSettings: () => settingsStore.get(),
    getProfile: (profileId) => profileStore.get(profileId),
    matchGlossary: (text, sourceLanguage, targetLanguage) => glossaryStore.matches(text, sourceLanguage, targetLanguage),
    createGateway
  });
  const translationManager = new TranslationManager(settingsStore, historyStore, glossaryStore, profileStore, translationSessionStore, { engine: translationEngine, createGateway });
  const documentManager = new DocumentManager(documentStore, profileStore, settingsStore, glossaryStore, translationEngine, createGateway);
  const ocrService = new WindowsOcrService();
  const runtimeService = new RuntimeService({
    runtimeInfo: () => ({ apiVersion: 2, electron: process.versions.electron, platform: process.platform }),
    providerHealth: () => createProvider(settingsStore.get()).healthCheck(),
    providerModels: () => createProvider(settingsStore.get()).getModels(),
    captureSelection: () => captureSelectedText(settingsStore.get().translation.maxInputLength),
    exportDiagnostics: () => diagnosticsExporter.export()
  });

  const openSelectionInMain = async (text: string, mode: TranslationMode, profileId?: string): Promise<void> => {
    const mainWindow = await windowManager.showMainWindow(mode === "naming" ? "/?mode=naming" : "/");
    if (!text.trim()) return;
    translationManager.start(mainWindow.webContents, {
      text,
      mode,
      targetLanguage: mode === "naming" ? "en" : "auto",
      profileId,
      namingOptions: mode === "naming" ? { type: "variable", style: "camelCase", language: "general" } : undefined,
      surface: "main"
    });
  };

  const triggerSelection = async (mode: TranslationMode, profileId?: string): Promise<void> => {
    const resolvedProfileId = mode === "naming"
      ? undefined
      : (profileId ?? settingsStore.get().shortcuts.defaultTranslationProfileId) || "technical";
    translationManager.cancelLane("popup-translation");
    const selection = await captureSelectedText(settingsStore.get().translation.maxInputLength);
    if (windowManager.isPopupPinned()) {
      await openSelectionInMain(selection.text, mode, resolvedProfileId);
      return;
    }
    await windowManager.showPopup(
      { mode, profileId: resolvedProfileId, text: selection.text, error: selection.error },
      { focus: true }
    );
  };

  const triggerQuickTranslate = async (): Promise<void> => {
    const profileId = settingsStore.get().shortcuts.defaultTranslationProfileId || "technical";
    await triggerSelection(modeShortcutForProfile(profileId), profileId);
  };

  const showCapturedSelection = async (text: string): Promise<void> => {
    const profileId = settingsStore.get().shortcuts.defaultTranslationProfileId || "technical";
    const mode = modeShortcutForProfile(profileId);
    translationManager.cancelLane("popup-translation");
    if (windowManager.isPopupPinned()) {
      await openSelectionInMain(text, mode, profileId);
      return;
    }
    await windowManager.showPopup({ mode, profileId, text }, { focus: true });
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

  const applyStartup = (settings: AppSettings): void => {
    app.setLoginItemSettings({ openAtLogin: settings.startup.enabled });
  };
  const applyShortcuts = (settings: AppSettings) => {
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
  const applyWindow = (settings: AppSettings): void => {
    windowManager.setFontSize(settings.window.fontSize);
  };
  const applySettings = (settings: AppSettings) => {
    applyWindow(settings);
    applyStartup(settings);
    return applyShortcuts(settings);
  };
  let settingsUseCases: SettingsUseCases;
  const clearLocalData = async (): Promise<void> => {
    translationManager.cancel();
    await documentManager.cancelAll();
    await Promise.all([historyStore.clear(), glossaryStore.clear(), profileStore.clear(), documentStore.clear(), vocabularyStore.clear()]);
    await settingsUseCases.reset();
    documentManager.resumeAccepting();
  };

  settingsUseCases = new SettingsUseCases(settingsStore, settingsService, historyService, { applyShortcuts, applyStartup, applyWindow });

  trayManager = new TrayManager({
    openMain: () => void windowManager.showMainWindow(),
    quickTranslate: () => void triggerQuickTranslate(),
    naming: () => void triggerSelection("naming"),
    screenshot: () => void windowManager.requestOcrCapture(),
    openSettings: () => void windowManager.showMainWindow("/settings"),
    togglePaused: (paused) => {
      void settingsUseCases.patch({ type: "update-shortcuts", value: { paused } });
    },
    quit: () => app.quit()
  });

  trayManager.create(settingsStore.get().shortcuts);
  applySettings(settingsStore.get());
  registerAllIpc({
    settingsUseCases,
    runtimeService,
    historyService,
    dictionaryService,
    glossaryService,
    vocabularyService,
    profileService,
    documentManager,
    ocrService,
    translationManager,
    translationSessionStore,
    windowManager,
    clipboardWrite: (text) => clipboard.writeText(text),
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
