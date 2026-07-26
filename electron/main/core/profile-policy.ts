import type { AppSettings, ProviderType, TranslationProfile } from "../../shared/types";
import { resolveModelRoute, type ModelRouteTask } from "./model-routing";

/** Profiles default to allowing remote providers to keep existing local data compatible. */
export function canProfileUseProvider(profile: { allowRemote?: boolean } | undefined, providerType: ProviderType): boolean {
  return profile?.allowRemote !== false || providerType !== "openai-compatible";
}

export const REMOTE_PROVIDER_BLOCKED_MESSAGE = "当前 Profile 已禁止将内容发送给远程模型。请切换到本地 Provider，或在 Profile 设置中允许远程模型。";

export function hasRemoteProviderConsent(provider: { type: ProviderType; remoteUsageConfirmed?: boolean }): boolean {
  return provider.type !== "openai-compatible" || provider.remoteUsageConfirmed === true;
}

export const REMOTE_PROVIDER_CONSENT_MESSAGE = "使用远程模型前请先在设置中确认隐私提示。";

export type ModelAccessTask = ModelRouteTask | "revision" | "alternatives" | "dictionary";

export interface ModelAccessOk {
  ok: true;
  settings: AppSettings;
  routeReason: string;
}

export interface ModelAccessDenied {
  ok: false;
  error: string;
}

/**
 * Single gate for every model call: Profile 禁远程、远程确认、Profile 指定模型与路由。
 * Call sites must not re-implement these checks.
 */
export function resolveModelAccess(
  settings: AppSettings,
  options: {
    profile?: Pick<TranslationProfile, "allowRemote" | "modelId"> | undefined;
    task: ModelAccessTask;
    textLength?: number;
  }
): ModelAccessOk | ModelAccessDenied {
  if (!canProfileUseProvider(options.profile, settings.provider.type)) {
    return { ok: false, error: REMOTE_PROVIDER_BLOCKED_MESSAGE };
  }
  if (!hasRemoteProviderConsent(settings.provider)) {
    return { ok: false, error: REMOTE_PROVIDER_CONSENT_MESSAGE };
  }
  const routeTask: ModelRouteTask = options.task === "document" ? "document" : "translation";
  const route = resolveModelRoute(settings, routeTask, options.textLength ?? 0, options.profile?.modelId);
  return {
    ok: true,
    settings: { ...settings, provider: { ...settings.provider, model: route.model } },
    routeReason: route.reason
  };
}
