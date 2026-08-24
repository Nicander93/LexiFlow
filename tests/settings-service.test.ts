import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../electron/shared/defaults";
import { SettingsService, applySettingsPatch, type SettingsRepository } from "../electron/main/application/settings/settings-service";
import { SettingsUseCases } from "../electron/main/application/settings/settings-use-cases";
import type { AppSettings } from "../electron/shared/types";
import type { SettingsStore } from "../electron/main/storage/settings";

function fakeStore(): { store: SettingsStore; value: AppSettings } {
  const value = structuredClone(DEFAULT_SETTINGS);
  const store = {
    get: () => structuredClone(value),
    getPublic: () => structuredClone(value),
    update: async (next: AppSettings) => Object.assign(value, structuredClone(next)),
    patch: async (command: Parameters<SettingsStore["patch"]>[0]) => {
      if (command.type === "update-provider") value.provider = { ...value.provider, ...command.value };
      if (command.type === "update-window") value.window = { ...value.window, ...command.value };
      return structuredClone(value);
    }
  } as unknown as SettingsStore;
  return { store, value };
}

describe("SettingsService 字段级命令", () => {
  it("并发 provider 与 popupBounds 更新不会互相覆盖", async () => {
    const { store } = fakeStore();
    const service = new SettingsService(store);
    await Promise.all([
      service.update({ type: "update-provider", value: { model: "new-model" } }),
      service.patchWindow({ popupBounds: { width: 700, height: 500 } })
    ]);
    expect(store.get().provider.model).toBe("new-model");
    expect(store.get().window.popupBounds).toEqual({ width: 700, height: 500 });
    expect(service.getSnapshot().revision).toBe(2);
  });

  it("只在对应字段变化时应用 startup 与快捷键副作用", async () => {
    let value = structuredClone(DEFAULT_SETTINGS);
    const store: SettingsRepository = {
      get: () => structuredClone(value),
      getPublic: () => structuredClone(value),
      patch: async (command) => {
        value = applySettingsPatch(value, command);
        return structuredClone(value);
      },
      reset: async () => {
        value = structuredClone(DEFAULT_SETTINGS);
        return structuredClone(value);
      }
    };
    const service = new SettingsService(store);
    const applyShortcuts = vi.fn(() => ({ translation: true, naming: true, screenshot: true, errors: [] }));
    const applyStartup = vi.fn();
    const useCases = new SettingsUseCases(store, service, { prune: vi.fn(async () => undefined) } as never, { applyShortcuts, applyStartup });

    await useCases.patch({ type: "update-general", value: { startup: { enabled: !DEFAULT_SETTINGS.startup.enabled } } });
    expect(applyStartup).toHaveBeenCalledTimes(1);
    expect(applyShortcuts).not.toHaveBeenCalled();

    await useCases.patch({ type: "update-window", value: { popupBounds: { width: 700, height: 500 } } });
    expect(applyStartup).toHaveBeenCalledTimes(1);
    expect(applyShortcuts).not.toHaveBeenCalled();

    await useCases.patch({ type: "update-shortcuts", value: { paused: true } });
    expect(applyShortcuts).toHaveBeenCalledTimes(1);
  });

  it("快捷键注册冲突时不持久化新设置并恢复旧组合", async () => {
    let value = structuredClone(DEFAULT_SETTINGS);
    const store: SettingsRepository = {
      get: () => structuredClone(value),
      getPublic: () => structuredClone(value),
      patch: async (command) => {
        value = applySettingsPatch(value, command);
        return structuredClone(value);
      },
      reset: async () => structuredClone(DEFAULT_SETTINGS)
    };
    const service = new SettingsService(store);
    const applyShortcuts = vi.fn()
      .mockReturnValueOnce({ translation: false, naming: true, screenshot: true, errors: ["快捷键已被 VS Code 占用。"] })
      .mockReturnValueOnce({ translation: true, naming: true, screenshot: true, errors: [] });
    const useCases = new SettingsUseCases(store, service, { prune: vi.fn(async () => undefined) } as never, { applyShortcuts });
    const before = store.get().shortcuts.translation;

    await expect(useCases.patch({ type: "update-shortcuts", value: { translation: "Ctrl+Shift+Alt+Y" } })).rejects.toThrow("VS Code");
    expect(store.get().shortcuts.translation).toBe(before);
    expect(applyShortcuts).toHaveBeenCalledTimes(2);
    expect(applyShortcuts).toHaveBeenLastCalledWith(expect.objectContaining({ shortcuts: expect.objectContaining({ translation: before }) }));
  });
});
