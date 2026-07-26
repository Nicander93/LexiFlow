import type { AppSettings } from "../../shared/types";

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
  if (!settings.shortcuts.translation.trim() || !settings.shortcuts.naming.trim() || !settings.shortcuts.screenshot.trim()) errors.push("快捷键不能为空。 ");
  if (new Set([settings.shortcuts.translation, settings.shortcuts.naming, settings.shortcuts.screenshot]).size < 3) errors.push("翻译、命名和截图不能使用相同快捷键。 ");
  if (settings.translation.maxInputLength < 100) errors.push("最大输入长度不能小于 100。 ");
  if (settings.history.maxItems < 1) errors.push("历史记录数量不能小于 1。 ");
  if (!['7d', '30d', 'forever', 'clear-on-exit'].includes(settings.history.retention)) errors.push("历史记录保留周期无效。 ");
  if (settings.routing.shortTextMaxLength < 1) errors.push("短文本路由阈值必须大于 0。 ");
  return errors;
}
