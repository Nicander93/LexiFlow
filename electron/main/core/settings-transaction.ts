import type { AppSettings, ShortcutRegistrationResult } from "../../shared/types";

interface SettingsTransactionDependencies {
  getCurrent: () => AppSettings;
  validate: (settings: AppSettings) => string[];
  apply: (settings: AppSettings) => ShortcutRegistrationResult;
  persist: (settings: AppSettings) => Promise<AppSettings>;
}

/** 先注册运行时能力再持久化；任一步失败都恢复旧快捷键。 */
export async function updateSettingsTransaction(
  next: AppSettings,
  dependencies: SettingsTransactionDependencies
): Promise<{ settings: AppSettings; shortcutResult: ShortcutRegistrationResult }> {
  const errors = dependencies.validate(next);
  if (errors.length) throw new Error(errors.join("\n"));
  const previous = dependencies.getCurrent();
  const shortcutResult = dependencies.apply(next);
  if (shortcutResult.errors.length) {
    dependencies.apply(previous);
    throw new Error(shortcutResult.errors.join("\n"));
  }
  try {
    const settings = await dependencies.persist(next);
    return { settings, shortcutResult };
  } catch (error) {
    dependencies.apply(previous);
    throw error;
  }
}
