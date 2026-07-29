import { describe, expect, it } from "vitest";
import { DEFAULT_PROMPTS, DEFAULT_SETTINGS } from "../electron/shared/defaults";
import { getBuiltInProfiles } from "../electron/main/storage/profiles";
import { buildAlternativesPrompt, buildPrompt, buildRevisionPrompt } from "../electron/main/core/prompt";
import {
  modeShortcutForProfile,
  profileIdForModeShortcut,
  resolveTranslationPolicy
} from "../electron/main/core/translation-policy";

describe("Translation Policy：Mode 与 Profile 统一", () => {
  const profiles = getBuiltInProfiles();
  const byId = (id: string) => profiles.find((profile) => profile.id === id);

  it("general Profile 使用通用 Prompt", () => {
    const policy = resolveTranslationPolicy(DEFAULT_SETTINGS, byId("general"), {
      mode: "normal",
      targetLanguage: "auto",
      profileId: "general"
    });
    expect(policy.systemPrompt).toBe(DEFAULT_PROMPTS.normal);
    expect(policy.historyMode).toBe("normal");
    expect(buildPrompt({ text: "hi", mode: policy.historyMode, targetLanguage: "auto", profilePrompt: policy.systemPrompt }, DEFAULT_SETTINGS).system)
      .toBe(DEFAULT_PROMPTS.normal);
  });

  it("technical Profile 使用技术 Prompt", () => {
    const policy = resolveTranslationPolicy(DEFAULT_SETTINGS, byId("technical"), {
      mode: "normal",
      targetLanguage: "auto",
      profileId: "technical"
    });
    expect(policy.systemPrompt).toContain("保留 URL、文件路径、命令");
    expect(policy.historyMode).toBe("technical");
  });

  it("academic Profile 使用学术 Prompt", () => {
    const policy = resolveTranslationPolicy(DEFAULT_SETTINGS, byId("academic"), {
      mode: "technical",
      targetLanguage: "auto",
      profileId: "academic"
    });
    expect(policy.systemPrompt).toContain("学术语体");
    expect(policy.historyMode).toBe("normal");
  });

  it("自定义 Profile 使用自定义 Prompt，且覆盖 mode", () => {
    const custom = {
      id: "custom-legal",
      name: "法律",
      systemPrompt: "你是法律翻译。",
      sourceLanguage: "auto" as const,
      targetLanguage: "zh-CN" as const,
      preserveMarkdown: true,
      preserveCode: true,
      enableGlossary: true,
      dictionaryMode: "contextual" as const,
      isBuiltIn: false,
      temperature: 0.2
    };
    const policy = resolveTranslationPolicy(DEFAULT_SETTINGS, custom, {
      mode: "technical",
      targetLanguage: "auto",
      profileId: "custom-legal"
    });
    expect(policy.systemPrompt).toBe("你是法律翻译。");
    expect(policy.temperature).toBe(0.2);
    expect(policy.targetLanguage).toBe("zh-CN");
  });

  it("Naming 任务使用命名 Prompt，不受翻译 Profile 覆盖", () => {
    const policy = resolveTranslationPolicy(DEFAULT_SETTINGS, byId("technical"), {
      mode: "naming",
      targetLanguage: "auto",
      profileId: "technical"
    });
    expect(policy.taskType).toBe("naming");
    expect(policy.systemPrompt).toBe(DEFAULT_PROMPTS.naming);
    expect(policy.enableGlossary).toBe(false);
    expect(policy.historyMode).toBe("naming");
  });

  it("无 Profile 时按 mode 回退，快捷入口与 Profile 对应", () => {
    expect(resolveTranslationPolicy(DEFAULT_SETTINGS, undefined, {
      mode: "technical",
      targetLanguage: "en"
    }).systemPrompt).toBe(DEFAULT_PROMPTS.technical);
    expect(profileIdForModeShortcut("normal")).toBe("general");
    expect(profileIdForModeShortcut("technical")).toBe("technical");
    expect(modeShortcutForProfile("academic")).toBe("normal");
    expect(modeShortcutForProfile("technical")).toBe("technical");
  });

  it("局部重译和候选继承 Profile Prompt", () => {
    const technical = getBuiltInProfiles().find((profile) => profile.id === "technical")!;
    const revision = buildRevisionPrompt({
      segment: { id: "segment-2", source: "Keep this sentence.", target: "保留这句话。", sourceStart: 0, sourceEnd: 19 },
      instruction: "更正式",
      targetLanguage: "zh-CN",
      profilePrompt: technical.systemPrompt
    }, DEFAULT_SETTINGS);
    expect(revision.system).toContain("保留 URL、文件路径、命令");
    expect(revision.system).toContain("只返回新的完整译文");

    const alternatives = buildAlternativesPrompt({
      segment: { id: "segment-2", source: "Keep this sentence.", target: "保留这句话。", sourceStart: 0, sourceEnd: 19 },
      targetLanguage: "zh-CN",
      profilePrompt: technical.systemPrompt
    }, DEFAULT_SETTINGS);
    expect(alternatives.system).toContain("保留 URL、文件路径、命令");
  });
});
