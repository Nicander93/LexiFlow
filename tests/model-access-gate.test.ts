import { describe, expect, it } from "vitest";
import {
  REMOTE_PROVIDER_BLOCKED_MESSAGE,
  REMOTE_PROVIDER_CONSENT_MESSAGE,
  canProfileUseProvider,
  hasRemoteProviderConsent,
  resolveModelAccess,
  type ModelAccessTask
} from "../electron/main/core/model-access-gate";
import { DEFAULT_SETTINGS } from "../electron/shared/defaults";
import type { AppSettings } from "../electron/shared/types";

function settingsWith(provider: Partial<AppSettings["provider"]>, routing?: AppSettings["routing"]): AppSettings {
  return {
    ...structuredClone(DEFAULT_SETTINGS),
    provider: { ...DEFAULT_SETTINGS.provider, ...provider },
    routing: routing ?? DEFAULT_SETTINGS.routing
  };
}

const TASKS: ModelAccessTask[] = ["translation", "document", "revision", "alternatives", "dictionary"];

describe("Profile 隐私策略", () => {
  it("禁止远程时仍允许本地 Provider，并拦截远程 Provider", () => {
    expect(canProfileUseProvider({ allowRemote: false }, "ollama")).toBe(true);
    expect(canProfileUseProvider({ allowRemote: false }, "openai-compatible")).toBe(false);
  });

  it("历史 Profile 未设置策略时保持兼容，允许已配置的 Provider", () => {
    expect(canProfileUseProvider({}, "openai-compatible")).toBe(true);
  });

  it("远程 Provider 必须获得明确同意，本地 Provider 不受影响", () => {
    expect(hasRemoteProviderConsent({ type: "ollama" })).toBe(true);
    expect(hasRemoteProviderConsent({ type: "openai-compatible" })).toBe(false);
    expect(hasRemoteProviderConsent({ type: "openai-compatible", remoteUsageConfirmed: true })).toBe(true);
  });
});

describe("统一模型访问校验", () => {
  for (const task of TASKS) {
    describe(task, () => {
      it("本地 Provider 可通过", () => {
        const access = resolveModelAccess(settingsWith({ type: "ollama", model: "qwen3.5:9b" }), {
          task,
          profile: { allowRemote: false, modelId: "local-fixed" },
          textLength: 20
        });
        expect(access).toMatchObject({ ok: true, settings: { provider: { model: "local-fixed" } }, routeReason: "profile" });
      });

      it("已确认远程 Provider 可通过", () => {
        const access = resolveModelAccess(
          settingsWith({ type: "openai-compatible", model: "gpt", remoteUsageConfirmed: true }),
          { task, profile: { allowRemote: true }, textLength: 20 }
        );
        expect(access.ok).toBe(true);
        if (access.ok) expect(access.settings.provider.model).toBe("gpt");
      });

      it("未确认远程 Provider 被拒绝", () => {
        const access = resolveModelAccess(
          settingsWith({ type: "openai-compatible", model: "gpt", remoteUsageConfirmed: false }),
          { task, profile: { allowRemote: true }, textLength: 20 }
        );
        expect(access).toEqual({ ok: false, error: REMOTE_PROVIDER_CONSENT_MESSAGE });
      });

      it("Profile 禁远程时拒绝远程 Provider", () => {
        const access = resolveModelAccess(
          settingsWith({ type: "openai-compatible", model: "gpt", remoteUsageConfirmed: true }),
          { task, profile: { allowRemote: false }, textLength: 20 }
        );
        expect(access).toEqual({ ok: false, error: REMOTE_PROVIDER_BLOCKED_MESSAGE });
      });
    });
  }

  it("文档任务启用路由时使用文档模型", () => {
    const access = resolveModelAccess(
      settingsWith(
        { type: "ollama", model: "default" },
        { enabled: true, shortTextMaxLength: 50, shortTextModel: "short", documentModel: "doc-model" }
      ),
      { task: "document", textLength: 500 }
    );
    expect(access).toMatchObject({ ok: true, settings: { provider: { model: "doc-model" } }, routeReason: "document" });
  });
});
