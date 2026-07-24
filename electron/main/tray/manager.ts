import { Menu, nativeImage, Tray } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ShortcutSettings } from "../../shared/types";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

function createTrayIcon() {
  const iconPath = join(moduleDirectory, "../../build/icon.ico");
  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    throw new Error(`Tray icon is empty: ${iconPath}`);
  }
  return icon;
}

interface TrayActions {
  openMain: () => void;
  quickTranslate: () => void;
  naming: () => void;
  openSettings: () => void;
  togglePaused: (paused: boolean) => void;
  quit: () => void;
}

export class TrayManager {
  private tray: Tray | null = null;

  constructor(private readonly actions: TrayActions) {}

  create(shortcuts: ShortcutSettings): void {
    if (!this.tray) {
      this.tray = new Tray(createTrayIcon());
      this.tray.setToolTip("LexiFlow 桌面翻译");
      this.tray.on("double-click", this.actions.openMain);
    }
    this.update(shortcuts);
  }

  update(shortcuts: ShortcutSettings): void {
    if (!this.tray) return;
    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: "打开主窗口", click: this.actions.openMain },
      { type: "separator" },
      { label: "快速翻译", accelerator: shortcuts.translation, click: this.actions.quickTranslate },
      { label: "编程命名", accelerator: shortcuts.naming, click: this.actions.naming },
      { label: "设置", click: this.actions.openSettings },
      { type: "separator" },
      {
        label: "暂停全局快捷键",
        type: "checkbox",
        checked: shortcuts.paused,
        click: (item) => this.actions.togglePaused(item.checked)
      },
      { type: "separator" },
      { label: "退出", click: this.actions.quit }
    ]));
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }
}
