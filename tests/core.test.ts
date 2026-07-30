import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../electron/shared/defaults";
import { detectLanguage, resolveTargetLanguage } from "../electron/main/core/language";
import { buildModelOptions } from "../electron/main/core/model-options";
import { buildDictionaryContextPrompt, buildPrompt, buildRevisionPrompt } from "../electron/main/core/prompt";
import { validateSettings } from "../electron/main/core/settings-validation";
import { isCapturedSelection, validateInput } from "../electron/main/core/validation";
import { mapProviderError, UserFacingError } from "../electron/main/core/errors";
import { reactive } from "vue";
import { toIpcPayload } from "../electron/shared/serialization";

describe("语言检测", () => {
  it("识别中英文并解析自动目标语言", () => {
    expect(detectLanguage("Read the API documentation")).toBe("en");
    expect(detectLanguage("读取 API 文档")).toBe("zh-CN");
    expect(resolveTargetLanguage("Hello world", "auto")).toBe("zh-CN");
    expect(resolveTargetLanguage("你好", "auto")).toBe("en");
    expect(resolveTargetLanguage("Hello", "en")).toBe("en");
  });
});

describe("文本与剪贴板校验", () => {
  it("拒绝空文本和超长文本并保留格式", () => {
    expect(validateInput(" \n\t", 100).ok).toBe(false);
    expect(validateInput("a".repeat(101), 100).ok).toBe(false);
    expect(validateInput("line 1\r\n\tline 2", 100)).toEqual({ ok: true, text: "line 1\n\tline 2" });
  });

  it("通过临时标记判断复制是否成功，也允许选中文字与旧剪贴板相同", () => {
    expect(isCapturedSelection("same", "marker")).toBe(true);
    expect(isCapturedSelection("marker", "marker")).toBe(false);
    expect(isCapturedSelection("   ", "marker")).toBe(false);
  });
});

describe("提示词和模型参数", () => {
  it("技术翻译保留约束并自动指定中文", () => {
    const prompt = buildPrompt(
      { text: "Run docker compose up -d and check application.yml.", mode: "technical", targetLanguage: "auto" },
      DEFAULT_SETTINGS
    );
    expect(prompt.system).toContain("保留 URL、文件路径、命令");
    expect(prompt.user).toContain("目标语言：简体中文");
  });

  it("构造低随机性和动态 token 参数", () => {
    expect(buildModelOptions(10)).toEqual({ temperature: 0.1, topP: 0.8, maxTokens: 512 });
    expect(buildModelOptions(10_000).maxTokens).toBe(8192);
    expect(buildModelOptions(10, 0.35).temperature).toBe(0.35);
    expect(buildModelOptions(10, 5).temperature).toBe(2);
  });

  it("局部重译只包含选中句段和明确要求", () => {
    const prompt = buildRevisionPrompt({
      segment: { id: "segment-2", source: "Keep this sentence.", target: "保留这句话。", sourceStart: 0, sourceEnd: 19 },
      instruction: "更正式",
      targetLanguage: "zh-CN"
    }, DEFAULT_SETTINGS);
    expect(prompt.user).toContain("Keep this sentence.");
    expect(prompt.user).toContain("更正式");
    expect(prompt.system).toContain("只返回新的完整译文");
  });

  it("词典上下文提示只发送选中词与所属双语句段", () => {
    const prompt = buildDictionaryContextPrompt({ term: "model", source: "The model is ready.", target: "模型已就绪。", targetLanguage: "zh-CN" }, DEFAULT_SETTINGS);
    expect(prompt.user).toContain("查询词：model");
    expect(prompt.user).toContain("对应译文：模型已就绪。");
    expect(prompt.system).toContain("上下文释义");
  });
});


describe("设置和错误映射", () => {
  it("校验 URL、模型、快捷键和数值范围", () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.provider.baseUrl = "file:///tmp/model";
    settings.provider.model = "";
    settings.shortcuts.naming = settings.shortcuts.translation;
    settings.shortcuts.screenshot = settings.shortcuts.translation;
    settings.provider.timeoutMs = 50;
    expect(validateSettings(settings).length).toBeGreaterThanOrEqual(4);
  });

  it("映射用户可理解的模型错误", () => {
    expect(mapProviderError(new Error("ECONNREFUSED"))).toContain("无法连接");
    expect(mapProviderError(new Error("401 Unauthorized"))).toContain("API Key");
    expect(mapProviderError(new UserFacingError("模型不可用"))).toBe("模型不可用");
  });
});

describe("渲染进程 IPC 边界", () => {
  it("将 Vue 响应式对象转换为可序列化的纯数据", () => {
    const options = reactive({ type: "boolean", nested: { style: "camelCase" } });
    const payload = toIpcPayload(options);
    expect(payload).toEqual({ type: "boolean", nested: { style: "camelCase" } });
    expect(() => structuredClone(payload)).not.toThrow();
  });
});
