import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "D:/tmp/lexiflow-test" },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: vi.fn(),
    decryptString: vi.fn()
  }
}));

import { mergeSettings } from "../electron/main/storage/settings";

describe("设置迁移", () => {
  it("把未自定义的旧快捷键迁移为低冲突组合并启用后台启动", () => {
    const migrated = mergeSettings({
      shortcuts: {
        translation: "Ctrl+Alt+T",
        naming: "Ctrl+Alt+N",
        screenshot: "Ctrl+Alt+S"
      },
      startup: { enabled: false }
    } as never);
    expect(migrated.shortcuts).toMatchObject({
      translation: "Ctrl+Alt+Shift+T",
      naming: "Ctrl+Alt+Shift+N",
      screenshot: "Ctrl+Alt+Shift+S"
    });
    expect(migrated.startup.enabled).toBe(true);
  });

  it("保留已经自定义的快捷键和开机启动选择", () => {
    const migrated = mergeSettings({
      shortcuts: { translation: "F8" },
      startup: { enabled: false }
    } as never);
    expect(migrated.shortcuts.translation).toBe("F8");
    expect(migrated.startup.enabled).toBe(false);
  });
});
