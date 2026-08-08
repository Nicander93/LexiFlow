import type { AppSettings } from "../../shared/types";
import { findShortcutConflict, isValidShortcut, normalizeShortcut } from "../../shared/shortcut";

/** Collect every settings error so the settings page can show them at once; empty means ok. 返回全部错误，通过则空数组。 */
export function validateSettings(settings: AppSettings): string[] {
  const errors: string[] = [];
  try {
    const url = new URL(settings.provider.baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) errors.push("模型服务地址必须使用 HTTP 或 HTTPS。 ");
  } catch {
    errors.push("模型服务地址格式不正确。 ");
  }
  if (!settings.provider.model.trim()) errors.push("模型名称不能为空。 ");
  if (settings.provider.timeoutMs < 1_000) errors.push("请求超时时间不能小于 1000 毫秒。 ");
  if (!Number.isFinite(settings.window.fontSize) || settings.window.fontSize < 10 || settings.window.fontSize > 24) {
    errors.push("界面字体大小必须在 10 到 24px 之间。");
  }
  for (const [label, shortcut] of [
    ["快速翻译", settings.shortcuts.translation],
    ["编程命名", settings.shortcuts.naming],
    ["截图 OCR", settings.shortcuts.screenshot]
  ] as const) {
    if (!isValidShortcut(shortcut)) errors.push(`${label}快捷键格式无效。`);
  }
  const conflict = findShortcutConflict(settings.shortcuts);
  if (conflict) errors.push(conflict);
  settings.shortcuts.translation = normalizeShortcut(settings.shortcuts.translation);
  settings.shortcuts.naming = normalizeShortcut(settings.shortcuts.naming);
  settings.shortcuts.screenshot = normalizeShortcut(settings.shortcuts.screenshot);
  if (settings.translation.maxInputLength < 100) errors.push("最大输入长度不能小于 100。 ");
  if (settings.history.maxItems < 1) errors.push("历史记录数量不能小于 1。 ");
  if (!['7d', '30d', 'forever', 'clear-on-exit'].includes(settings.history.retention)) errors.push("历史记录保留周期无效。 ");
  if (settings.routing.shortTextMaxLength < 1) errors.push("短文本路由阈值必须大于 0。 ");
  return errors;
}
