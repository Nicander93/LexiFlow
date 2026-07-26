import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../electron/shared/defaults";
import { resolveModelRoute } from "../electron/main/core/model-routing";

describe("模型路由", () => {
  it("关闭时使用全局模型，Profile 指定模型始终优先", () => {
    expect(resolveModelRoute(DEFAULT_SETTINGS, "translation", 20)).toEqual({ model: "qwen3.5:9b", reason: "default" });
    expect(resolveModelRoute(DEFAULT_SETTINGS, "translation", 20, "fixed-model")).toEqual({ model: "fixed-model", reason: "profile" });
  });

  it("只在用户启用后按短文本和文档规则选择模型", () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.routing = { enabled: true, shortTextMaxLength: 100, shortTextModel: "small", documentModel: "document" };
    expect(resolveModelRoute(settings, "translation", 100)).toEqual({ model: "small", reason: "short-text" });
    expect(resolveModelRoute(settings, "translation", 101)).toEqual({ model: "qwen3.5:9b", reason: "default" });
    expect(resolveModelRoute(settings, "document", 500)).toEqual({ model: "document", reason: "document" });
  });
});
