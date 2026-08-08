import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../electron/shared/defaults";
import { updateSettingsTransaction } from "../electron/main/core/settings-transaction";

const ok = { translation: true, naming: true, screenshot: true, errors: [] };

describe("settings transaction", () => {
  it("persists after runtime registration succeeds", async () => {
    const previous = structuredClone(DEFAULT_SETTINGS);
    const next = structuredClone(DEFAULT_SETTINGS);
    next.shortcuts.translation = "Ctrl+Alt+Y";
    const apply = vi.fn(() => ok);
    const persist = vi.fn(async () => next);
    await expect(updateSettingsTransaction(next, {
      getCurrent: () => previous,
      validate: () => [],
      apply,
      persist
    })).resolves.toMatchObject({ settings: next });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(next);
  });

  it("does not persist and restores runtime registration on conflict", async () => {
    const previous = structuredClone(DEFAULT_SETTINGS);
    const next = structuredClone(DEFAULT_SETTINGS);
    const apply = vi.fn()
      .mockReturnValueOnce({ ...ok, translation: false, errors: ["occupied"] })
      .mockReturnValueOnce(ok);
    const persist = vi.fn();
    await expect(updateSettingsTransaction(next, {
      getCurrent: () => previous,
      validate: () => [],
      apply,
      persist
    })).rejects.toThrow("occupied");
    expect(persist).not.toHaveBeenCalled();
    expect(apply).toHaveBeenLastCalledWith(previous);
  });

  it("restores runtime registration when persistence fails", async () => {
    const previous = structuredClone(DEFAULT_SETTINGS);
    const next = structuredClone(DEFAULT_SETTINGS);
    const apply = vi.fn(() => ok);
    await expect(updateSettingsTransaction(next, {
      getCurrent: () => previous,
      validate: () => [],
      apply,
      persist: async () => { throw new Error("disk full"); }
    })).rejects.toThrow("disk full");
    expect(apply).toHaveBeenLastCalledWith(previous);
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("rejects validation errors before runtime changes", async () => {
    const apply = vi.fn(() => ok);
    await expect(updateSettingsTransaction(structuredClone(DEFAULT_SETTINGS), {
      getCurrent: () => structuredClone(DEFAULT_SETTINGS),
      validate: () => ["duplicate"],
      apply,
      persist: async (settings) => settings
    })).rejects.toThrow("duplicate");
    expect(apply).not.toHaveBeenCalled();
  });
});
