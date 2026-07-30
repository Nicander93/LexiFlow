/**
 * 主进程 IPC 总入口：通道名以 shared/types IPC_CHANNELS 为准，与 preload / api.ts 一一对应。
 * 设置写入前走 validateSettings；模型类请求只转发到 TranslationManager / DocumentManager，不在此绕过访问校验。
 */
import { app, clipboard, dialog, ipcMain } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { captureSelectedText } from "../clipboard/selection";
import { buildDiagnosticReport } from "../core/diagnostics";
import { validateSettings } from "../core/settings-validation";
import { createProvider } from "../provider";
import type { HistoryStore } from "../storage/history";
import type { DictionaryService } from "../dictionary/dictionary-service";
import type { GlossaryStore } from "../storage/glossary";
import { exportGlossaryCsv, parseGlossaryCsv } from "../storage/glossary";
import type { ProfileStore } from "../storage/profiles";
import type { DocumentStore } from "../storage/documents";
import type { DocumentManager } from "../document/manager";
import type { WindowsOcrService } from "../ocr/windows-ocr";
import type { SettingsStore } from "../storage/settings";
import type { TranslationManager } from "../translation/manager";
import type { TranslationSessionStore } from "../translation/session-store";
import type { WindowManager } from "../window/manager";
import { assertTrustedSender } from "./security";
import {
  IPC_CHANNELS,
  type AppSettings,
  type DictionaryContextRequest,
  type DictionaryLookupRequest,
  type SegmentRevisionRequest,
  type SegmentAlternativeRequest,
  type TranslationRequest
} from "../../shared/types";

interface IpcDependencies {
  settingsStore: SettingsStore;
  historyStore: HistoryStore;
  dictionaryService: DictionaryService;
  glossaryStore: GlossaryStore;
  profileStore: ProfileStore;
  documentStore: DocumentStore;
  documentManager: DocumentManager;
  ocrService: WindowsOcrService;
  translationManager: TranslationManager;
  translationSessionStore: TranslationSessionStore;
  windowManager: WindowManager;
  applySettings: (settings: AppSettings) => unknown;
  clearLocalData: () => Promise<void>;
  triggerSelectionTip: () => void;
  dismissSelectionTip: () => void;
}

function withTrustedSender<Args extends unknown[], R>(
  handler: (event: Electron.IpcMainInvokeEvent, ...args: Args) => R
): (event: Electron.IpcMainInvokeEvent, ...args: Args) => R {
  return (event, ...args) => {
    assertTrustedSender(event);
    return handler(event, ...args);
  };
}

export function registerIpcHandlers(dependencies: IpcDependencies): void {
  const { settingsStore, historyStore, dictionaryService, glossaryStore, profileStore, documentStore, documentManager, ocrService, translationManager, translationSessionStore, windowManager } = dependencies;

  ipcMain.handle(IPC_CHANNELS.runtimePing, () => ({
    apiVersion: 2 as const,
    electron: process.versions.electron,
    platform: process.platform
  }));
  ipcMain.handle(IPC_CHANNELS.settingsGet, () => settingsStore.getPublic());
  ipcMain.handle(IPC_CHANNELS.settingsUpdate, withTrustedSender(async (_event, settings: AppSettings) => {
    const errors = validateSettings(settings);
    if (errors.length) throw new Error(errors.join("\n"));
    const updated = await settingsStore.update(settings);
    await historyStore.prune(updated.history);
    return { settings: updated, shortcutResult: dependencies.applySettings(settingsStore.get()) };
  }));
  ipcMain.handle(IPC_CHANNELS.providerHealth, async () => createProvider(settingsStore.get()).healthCheck());
  ipcMain.handle(IPC_CHANNELS.providerModels, async () => createProvider(settingsStore.get()).getModels());
  ipcMain.handle(IPC_CHANNELS.translationSessionGet, () => translationSessionStore.getActive());
  ipcMain.handle(IPC_CHANNELS.translationStart, (event, request: TranslationRequest) => translationManager.start(event.sender, request));
  ipcMain.on(IPC_CHANNELS.translationCancel, (_event, requestId?: string) => translationManager.cancel(requestId));
  ipcMain.handle(IPC_CHANNELS.revisionStart, (event, request: SegmentRevisionRequest) => translationManager.revise(event.sender, request));
  ipcMain.on(IPC_CHANNELS.revisionCancel, (_event, requestId?: string) => translationManager.cancel(requestId));
  ipcMain.handle(IPC_CHANNELS.alternativesStart, (event, request: SegmentAlternativeRequest) => translationManager.alternatives(event.sender, request));
  ipcMain.on(IPC_CHANNELS.alternativesCancel, (_event, requestId?: string) => translationManager.cancel(requestId));
  ipcMain.handle(IPC_CHANNELS.selectionCapture, () => captureSelectedText(settingsStore.get().translation.maxInputLength));
  ipcMain.on(IPC_CHANNELS.selectionTipTrigger, (event) => {
    assertTrustedSender(event);
    dependencies.triggerSelectionTip();
  });
  ipcMain.on(IPC_CHANNELS.selectionTipDismiss, (event) => {
    assertTrustedSender(event);
    dependencies.dismissSelectionTip();
  });
  ipcMain.handle(IPC_CHANNELS.historyList, () => historyStore.list());
  ipcMain.handle(IPC_CHANNELS.historyGet, (_event, id: string) => historyStore.get(id));
  ipcMain.handle(IPC_CHANNELS.historySearch, (_event, query: string) => historyStore.search(query));
  ipcMain.handle(IPC_CHANNELS.historyToggleFavorite, (_event, id: string) => historyStore.toggleFavorite(id));
  ipcMain.handle(IPC_CHANNELS.historyUpdateRevisions, withTrustedSender((_event, update) => historyStore.updateRevisions(update)));
  ipcMain.handle(IPC_CHANNELS.historyDelete, withTrustedSender((_event, id: string) => historyStore.delete(id)));
  ipcMain.handle(IPC_CHANNELS.historyClear, withTrustedSender(() => historyStore.clear()));
  ipcMain.handle(IPC_CHANNELS.dictionaryLookup, (_event, request: DictionaryLookupRequest) => {
    if (!request || typeof request !== "object" || typeof request.query !== "string") {
      return { query: "", normalizedQuery: "", found: false, matchType: "none" as const, suggestions: [], unavailableReason: "无效的词典查询请求。" };
    }
    if (request.query.length > 256) {
      return { query: request.query.slice(0, 256), normalizedQuery: "", found: false, matchType: "none" as const, suggestions: [], unavailableReason: "查询过长。" };
    }
    return dictionaryService.lookup(request);
  });
  ipcMain.handle(IPC_CHANNELS.dictionaryStatus, () => dictionaryService.getStatus());
  ipcMain.handle(IPC_CHANNELS.dictionaryContextStart, (event, request: DictionaryContextRequest) => translationManager.explainDictionary(event.sender, request));
  ipcMain.on(IPC_CHANNELS.dictionaryContextCancel, (_event, requestId?: string) => translationManager.cancel(requestId));
  ipcMain.handle(IPC_CHANNELS.glossaryList, () => glossaryStore.list());
  ipcMain.handle(IPC_CHANNELS.glossaryUpsert, withTrustedSender((_event, entry) => glossaryStore.upsert(entry)));
  ipcMain.handle(IPC_CHANNELS.glossaryDelete, withTrustedSender((_event, id: string) => glossaryStore.delete(id)));
  ipcMain.handle(IPC_CHANNELS.glossaryConflicts, () => glossaryStore.conflicts());
  ipcMain.handle(IPC_CHANNELS.glossaryImportCsv, withTrustedSender(async () => {
    const selection = await dialog.showOpenDialog({ title: "导入术语表 CSV", properties: ["openFile"], filters: [{ name: "CSV 文件", extensions: ["csv"] }] });
    if (selection.canceled || !selection.filePaths[0]) return { imported: 0, skipped: [] };
    const parsed = parseGlossaryCsv(await readFile(selection.filePaths[0], "utf8"));
    await glossaryStore.import(parsed.entries);
    return parsed.result;
  }));
  ipcMain.handle(IPC_CHANNELS.glossaryExportCsv, withTrustedSender(async () => {
    const defaultPath = join(app.getPath("documents"), "lexiflow-glossary.csv");
    const destination = await dialog.showSaveDialog({ title: "导出术语表 CSV", defaultPath, filters: [{ name: "CSV 文件", extensions: ["csv"] }] });
    if (destination.canceled || !destination.filePath) return { saved: false, count: 0 };
    const entries = glossaryStore.list();
    await writeFile(destination.filePath, exportGlossaryCsv(entries), "utf8");
    return { saved: true, count: entries.length };
  }));
  ipcMain.handle(IPC_CHANNELS.privacyClearLocalData, withTrustedSender(() => dependencies.clearLocalData()));
  ipcMain.handle(IPC_CHANNELS.diagnosticsExport, withTrustedSender(async () => {
    const defaultPath = join(app.getPath("documents"), `lexiflow-diagnostics-${Date.now()}.json`);
    const destination = await dialog.showSaveDialog({ title: "导出诊断信息", defaultPath, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (destination.canceled || !destination.filePath) return { saved: false };
    await writeFile(destination.filePath, JSON.stringify(buildDiagnosticReport(app.getVersion()), null, 2), "utf8");
    return { saved: true, path: destination.filePath };
  }));
  ipcMain.handle(IPC_CHANNELS.profileList, () => profileStore.list());
  ipcMain.handle(IPC_CHANNELS.profileUpsert, withTrustedSender((_event, profile) => profileStore.upsert(profile)));
  ipcMain.handle(IPC_CHANNELS.profileDelete, withTrustedSender((_event, id: string) => profileStore.delete(id)));
  ipcMain.handle(IPC_CHANNELS.documentList, () => documentStore.list());
  ipcMain.handle(IPC_CHANNELS.documentDelete, withTrustedSender((_event, id: string) => documentStore.delete(id)));
  ipcMain.handle(IPC_CHANNELS.documentImport, withTrustedSender((event, request) => documentManager.import(event.sender, request)));
  ipcMain.handle(IPC_CHANNELS.documentExport, withTrustedSender((event, request) => documentManager.export(event.sender, request)));
  ipcMain.handle(IPC_CHANNELS.documentStart, (event, taskId: string) => documentManager.start(event.sender, taskId));
  ipcMain.handle(IPC_CHANNELS.documentPause, (_event, taskId: string) => documentManager.pause(taskId));
  ipcMain.handle(IPC_CHANNELS.documentCancel, (_event, taskId: string) => documentManager.cancel(taskId));
  ipcMain.handle(IPC_CHANNELS.ocrListScreens, () => ocrService.listScreens());
  ipcMain.handle(IPC_CHANNELS.ocrCapture, (_event, screenId?: string) => ocrService.captureScreen(screenId));
  ipcMain.handle(IPC_CHANNELS.clipboardWrite, withTrustedSender((_event, text: string) => {
    if (typeof text !== "string") throw new Error("剪贴板内容无效。");
    clipboard.writeText(text);
  }));
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
  ipcMain.on(IPC_CHANNELS.popupAdaptHeight, (_event, kind?: "dictionary" | "translation" | "naming" | "default", contentHeight?: unknown) => {
    windowManager.adaptPopupHeight(kind ?? "default", typeof contentHeight === "number" && Number.isFinite(contentHeight) ? contentHeight : undefined);
  });

  app.on("before-quit", () => translationManager.cancel());
}
