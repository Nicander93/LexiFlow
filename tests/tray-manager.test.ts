import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../electron/shared/defaults";

const { trayHandlers, trayInstance, buildFromTemplate, createFromPath } = vi.hoisted(() => {
  const trayHandlers = new Map<string, () => void>();
  const trayInstance = {
    setToolTip: vi.fn(),
    on: vi.fn((event: string, handler: () => void) => trayHandlers.set(event, handler)),
    setContextMenu: vi.fn(),
    destroy: vi.fn()
  };
  return {
    trayHandlers,
    trayInstance,
    buildFromTemplate: vi.fn((template: unknown) => template),
    createFromPath: vi.fn(() => ({ isEmpty: () => false }))
  };
});

vi.mock("electron", () => ({
  Menu: { buildFromTemplate },
  nativeImage: { createFromPath },
  Tray: vi.fn(function () { return trayInstance; })
}));

import { TrayManager } from "../electron/main/tray/manager";

describe("TrayManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trayHandlers.clear();
  });

  it("创建带暂停开关和退出项的托盘菜单，并转发操作", () => {
    const actions = {
      openMain: vi.fn(),
      quickTranslate: vi.fn(),
      naming: vi.fn(),
      screenshot: vi.fn(),
      openSettings: vi.fn(),
      togglePaused: vi.fn(),
      quit: vi.fn()
    };
    const manager = new TrayManager(actions);

    manager.create(DEFAULT_SETTINGS.shortcuts);

    expect(createFromPath).toHaveBeenCalledTimes(1);
    expect(trayInstance.setToolTip).toHaveBeenCalledWith("LexiFlow 桌面翻译");
    expect(trayHandlers.get("double-click")).toBe(actions.openMain);
    const template = buildFromTemplate.mock.calls.at(-1)?.[0] as Array<{ label?: string; click?: (item: { checked: boolean }) => void }>;
    expect(template.map((item) => item.label).filter(Boolean)).toEqual(expect.arrayContaining(["打开主窗口", "快速翻译", "编程命名", "截图 OCR", "设置", "暂停全局快捷键", "退出"]));

    template.find((item) => item.label === "快速翻译")?.click?.({ checked: false });
    template.find((item) => item.label === "编程命名")?.click?.({ checked: false });
    template.find((item) => item.label === "截图 OCR")?.click?.({ checked: false });
    template.find((item) => item.label === "设置")?.click?.({ checked: false });
    template.find((item) => item.label === "暂停全局快捷键")?.click?.({ checked: true });
    template.find((item) => item.label === "退出")?.click?.({ checked: false });

    expect(actions.quickTranslate).toHaveBeenCalledTimes(1);
    expect(actions.naming).toHaveBeenCalledTimes(1);
    expect(actions.screenshot).toHaveBeenCalledTimes(1);
    expect(actions.openSettings).toHaveBeenCalledTimes(1);
    expect(actions.togglePaused).toHaveBeenCalledWith(true);
    expect(actions.quit).toHaveBeenCalledTimes(1);
  });

  it("更新设置时重建菜单但不重复创建托盘实例", () => {
    const actions = { openMain: vi.fn(), quickTranslate: vi.fn(), naming: vi.fn(), screenshot: vi.fn(), openSettings: vi.fn(), togglePaused: vi.fn(), quit: vi.fn() };
    const manager = new TrayManager(actions);

    manager.create(DEFAULT_SETTINGS.shortcuts);
    manager.update({ ...DEFAULT_SETTINGS.shortcuts, paused: true });

    expect(createFromPath).toHaveBeenCalledTimes(1);
    expect(trayInstance.setContextMenu).toHaveBeenCalledTimes(2);
  });
});
