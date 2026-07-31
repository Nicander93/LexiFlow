import { app, BrowserWindow, screen } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { IPC_CHANNELS, type PopupPayload } from "../../shared/types";
import { configureNavigationSecurity } from "../ipc/security";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private popupWindow: BrowserWindow | null = null;
  private selectionTipWindow: BrowserWindow | null = null;
  private selectionTipTimer?: ReturnType<typeof setTimeout>;
  private popupPinned = false;
  private fontSize = 14;
  private isQuitting = false;
  private rememberingBounds = false;

  constructor(
    private readonly getCloseAction: () => "hide" | "quit",
    private readonly shouldAutoHidePopup: () => boolean,
    private readonly getPopupBounds: () => { width: number; height: number } | undefined = () => undefined,
    private readonly savePopupBounds: (bounds: { width: number; height: number }) => void = () => undefined
  ) {}

  setQuitting(value: boolean): void {
    this.isQuitting = value;
  }

  private createWindow(options: Electron.BrowserWindowConstructorOptions): BrowserWindow {
    const window = new BrowserWindow({
      ...options,
      webPreferences: {
        preload: join(moduleDirectory, "../preload/index.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: process.env.LEXIFLOW_E2E !== "1"
      }
    });
    this.applyFontSize(window);
    window.webContents.on("did-finish-load", () => this.applyFontSize(window));
    configureNavigationSecurity(window);
    window.webContents.on("preload-error", (_event, preloadPath, error) => {
      console.error(`Preload failed: ${preloadPath}`, error.message);
    });
    window.webContents.on("render-process-gone", (_event, details) => {
      console.error(`Renderer process exited: ${details.reason} (${details.exitCode})`);
    });
    return window;
  }

  /** 将设置中的字号映射为 Electron 原生页面缩放比例。 */
  private applyFontSize(window: BrowserWindow): void {
    if (window.isDestroyed()) return;
    window.webContents.setZoomFactor(this.fontSize / 14);
  }

  setFontSize(fontSize: number): void {
    this.fontSize = fontSize;
    for (const window of [this.mainWindow, this.popupWindow, this.selectionTipWindow]) {
      if (window && !window.isDestroyed()) this.applyFontSize(window);
    }
  }

  private async loadRenderer(window: BrowserWindow, route = "/"): Promise<void> {
    const rendererUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_RENDERER_URL;
    if (rendererUrl) {
      await window.loadURL(`${rendererUrl}#${route}`);
    } else {
      await window.loadFile(join(moduleDirectory, "../../dist/index.html"), { hash: route });
    }
  }

  async createMainWindow(): Promise<BrowserWindow> {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) return this.mainWindow;
    const window = this.createWindow({
      width: 960,
      height: 680,
      minWidth: 760,
      minHeight: 560,
      show: false,
      title: "LexiFlow",
      icon: join(moduleDirectory, "../../build/icon.ico")
    });
    this.mainWindow = window;
    window.once("ready-to-show", () => window.show());
    window.on("close", (event) => {
      if (this.isQuitting) return;
      if (this.getCloseAction() === "hide") {
        event.preventDefault();
        window.hide();
        return;
      }
      this.isQuitting = true;
      app.quit();
    });
    window.on("closed", () => {
      this.mainWindow = null;
    });
    await this.loadRenderer(window);
    return window;
  }

  async showMainWindow(route = "/"): Promise<void> {
    const window = await this.createMainWindow();
    if (route !== "/") window.webContents.send("navigation:open", route);
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }

  async requestOcrCapture(): Promise<void> {
    const window = await this.createMainWindow();
    window.show();
    window.focus();
    window.webContents.send(IPC_CHANNELS.ocrCaptureRequested);
  }

  private maxPopupHeight(display = screen.getPrimaryDisplay()): number {
    return Math.max(320, Math.floor(display.workArea.height * 0.85));
  }

  async ensurePopupWindow(): Promise<BrowserWindow> {
    if (this.popupWindow && !this.popupWindow.isDestroyed()) return this.popupWindow;
    const saved = this.getPopupBounds();
    const width = Math.min(620, Math.max(360, saved?.width ?? 420));
    const height = Math.min(this.maxPopupHeight(), Math.max(220, saved?.height ?? 300));
    const window = this.createWindow({
      width,
      height,
      minWidth: 360,
      minHeight: 220,
      maxHeight: this.maxPopupHeight(),
      show: false,
      frame: false,
      transparent: false,
      resizable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      title: "LexiFlow 快速翻译"
    });
    this.popupWindow = window;
    window.on("blur", () => {
      if (!this.popupPinned && this.shouldAutoHidePopup()) window.hide();
    });
    const remember = (): void => {
      if (this.rememberingBounds || !this.popupWindow || this.popupWindow.isDestroyed()) return;
      this.rememberingBounds = true;
      const [nextWidth, nextHeight] = this.popupWindow.getSize();
      this.savePopupBounds({ width: nextWidth, height: nextHeight });
      this.rememberingBounds = false;
    };
    window.on("resized", remember);
    window.on("closed", () => {
      this.popupWindow = null;
    });
    await this.loadRenderer(window, "/popup");
    return window;
  }

  /** 按内容类型调整高度：词典紧凑，长文本抬高。 */
  adaptPopupHeight(kind: "dictionary" | "translation" | "naming" | "default" = "default", contentHeight?: number): void {
    if (!this.popupWindow || this.popupWindow.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const maxHeight = this.maxPopupHeight(display);
    const [width] = this.popupWindow.getSize();
    const fallbackHeight = kind === "dictionary" ? 250 : kind === "naming" ? 300 : kind === "translation" ? 340 : 280;
    const height = Math.min(maxHeight, Math.max(220, Math.round(contentHeight ?? fallbackHeight)));
    this.popupWindow.setMaximumSize(1200, maxHeight);
    this.popupWindow.setSize(width, height, false);
  }

  async showPopup(payload: PopupPayload): Promise<void> {
    const window = await this.ensurePopupWindow();
    const kind = payload.mode === "naming" ? "naming" : "translation";
    this.adaptPopupHeight(kind);
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const bounds = display.workArea;
    const [width, height] = window.getSize();
    const x = Math.min(Math.max(cursor.x + 16, bounds.x), bounds.x + bounds.width - width);
    const y = Math.min(Math.max(cursor.y + 16, bounds.y), bounds.y + bounds.height - height);
    window.setPosition(Math.round(x), Math.round(y), false);
    window.showInactive();
    window.webContents.send(IPC_CHANNELS.popupPayload, payload);
  }

  private async ensureSelectionTipWindow(): Promise<BrowserWindow> {
    if (this.selectionTipWindow && !this.selectionTipWindow.isDestroyed()) return this.selectionTipWindow;
    const window = this.createWindow({
      width: 34,
      height: 34,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      title: "LexiFlow selection translation"
    });
    this.selectionTipWindow = window;
    window.on("closed", () => {
      this.selectionTipWindow = null;
    });
    await this.loadRenderer(window, "/selection-tip");
    return window;
  }

  async showSelectionTip(point: { x: number; y: number }): Promise<void> {
    const window = await this.ensureSelectionTipWindow();
    const display = screen.getDisplayNearestPoint(point);
    const bounds = display.workArea;
    const [width, height] = window.getSize();
    const x = Math.min(Math.max(point.x + 4, bounds.x), bounds.x + bounds.width - width);
    const y = Math.min(Math.max(point.y + 6, bounds.y), bounds.y + bounds.height - height);
    window.setPosition(Math.round(x), Math.round(y), false);
    window.showInactive();
    if (this.selectionTipTimer) clearTimeout(this.selectionTipTimer);
    this.selectionTipTimer = setTimeout(() => this.hideSelectionTip(), 5_000);
  }

  hideSelectionTip(): void {
    if (this.selectionTipTimer) clearTimeout(this.selectionTipTimer);
    this.selectionTipTimer = undefined;
    this.selectionTipWindow?.hide();
  }

  isSelectionTipPoint(point: { x: number; y: number }): boolean {
    if (!this.selectionTipWindow?.isVisible()) return false;
    const bounds = this.selectionTipWindow.getBounds();
    return point.x >= bounds.x && point.x <= bounds.x + bounds.width
      && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
  }

  hidePopup(): void {
    this.popupWindow?.hide();
  }

  setPopupPinned(pinned: boolean): void {
    this.popupPinned = pinned;
  }
}
