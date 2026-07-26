import type { AppSettings } from "../../shared/types";

export type ModelRouteTask = "translation" | "document";

export interface ModelRoute {
  model: string;
  reason: "profile" | "default" | "short-text" | "document";
}

/**
 * Resolves an explicitly configured local/remote Provider model without changing Provider type or endpoint.
 * 只换 model 字段；优先级：Profile 指定 > 文档模型 > 短文本模型 > 默认。
 */
export function resolveModelRoute(settings: AppSettings, task: ModelRouteTask, textLength: number, profileModel?: string): ModelRoute {
  if (profileModel?.trim()) return { model: profileModel.trim(), reason: "profile" };
  if (!settings.routing.enabled) return { model: settings.provider.model, reason: "default" };
  if (task === "document" && settings.routing.documentModel?.trim()) return { model: settings.routing.documentModel.trim(), reason: "document" };
  if (task === "translation" && textLength <= settings.routing.shortTextMaxLength && settings.routing.shortTextModel?.trim()) return { model: settings.routing.shortTextModel.trim(), reason: "short-text" };
  return { model: settings.provider.model, reason: "default" };
}
