/**
 * Profile 存储：内置项不可删；缺省 allowRemote 视为 true，兼容旧数据。
 * 远程禁发判定见 core/model-access-gate.resolveModelAccess，不在本文件拦截。
 */
import { app } from "electron";
import { join } from "node:path";
import type { TranslationProfile } from "../../shared/types";
import { DEFAULT_PROMPTS } from "../../shared/defaults";
import { JsonStore } from "./json-store";
import { isStoredProfiles } from "./schema";

const BUILT_INS: TranslationProfile[] = [
  { id: "general", name: "通用翻译", description: "适用于日常阅读", systemPrompt: DEFAULT_PROMPTS.normal, sourceLanguage: "auto", targetLanguage: "auto", preserveMarkdown: false, preserveCode: true, enableGlossary: true, dictionaryMode: "basic", isBuiltIn: true },
  { id: "technical", name: "技术文档", description: "保留代码、路径和术语", systemPrompt: DEFAULT_PROMPTS.technical, sourceLanguage: "auto", targetLanguage: "auto", preserveMarkdown: true, preserveCode: true, enableGlossary: true, dictionaryMode: "contextual", isBuiltIn: true },
  { id: "academic", name: "学术论文", description: "准确、正式，保留引用与术语", systemPrompt: `${DEFAULT_PROMPTS.normal}\n使用严谨、正式的学术语体；保留引用、公式和专业术语。`, sourceLanguage: "auto", targetLanguage: "auto", preserveMarkdown: true, preserveCode: true, enableGlossary: true, dictionaryMode: "contextual", isBuiltIn: true },
  { id: "code-comment", name: "代码注释", description: "简洁清晰地解释代码意图", systemPrompt: `${DEFAULT_PROMPTS.technical}\n仅翻译注释和自然语言说明；代码、标识符和命令保持原样。`, sourceLanguage: "auto", targetLanguage: "auto", preserveMarkdown: true, preserveCode: true, enableGlossary: true, dictionaryMode: "basic", isBuiltIn: true },
  { id: "ui-copy", name: "UI 文案", description: "简短、自然、可直接用于界面", systemPrompt: `${DEFAULT_PROMPTS.normal}\n使用简短自然的产品界面文案，优先可读性和一致性。`, sourceLanguage: "auto", targetLanguage: "auto", preserveMarkdown: false, preserveCode: true, enableGlossary: true, dictionaryMode: "basic", isBuiltIn: true },
  { id: "variable-naming", name: "变量命名", description: "适合变量、方法和接口语义", systemPrompt: `${DEFAULT_PROMPTS.normal}\n面向软件工程命名翻译：保留技术语义，输出简洁明确的英文表达。`, sourceLanguage: "auto", targetLanguage: "en", preserveMarkdown: false, preserveCode: true, enableGlossary: true, dictionaryMode: "off", isBuiltIn: true },
  { id: "literal-reading", name: "直译阅读", description: "尽可能保持原句结构", systemPrompt: `${DEFAULT_PROMPTS.normal}\n尽可能逐句保持原文结构和信息顺序；不要为了自然度省略或重组信息。`, sourceLanguage: "auto", targetLanguage: "auto", temperature: 0.1, preserveMarkdown: true, preserveCode: true, enableGlossary: true, dictionaryMode: "basic", isBuiltIn: true },
  { id: "natural-expression", name: "自然表达", description: "更符合目标语言的表达习惯", systemPrompt: `${DEFAULT_PROMPTS.normal}\n在不改变信息的前提下，以目标语言母语者自然、流畅的方式表达。`, sourceLanguage: "auto", targetLanguage: "auto", temperature: 0.35, preserveMarkdown: true, preserveCode: true, enableGlossary: true, dictionaryMode: "contextual", isBuiltIn: true }
];

export interface ProfilesFile {
  schemaVersion: 1;
  profiles: TranslationProfile[];
}

function normalizeProfile(profile: TranslationProfile): TranslationProfile {
  return {
    ...profile,
    allowRemote: profile.allowRemote !== false
  };
}

export function getBuiltInProfiles(): TranslationProfile[] { return structuredClone(BUILT_INS); }

export class ProfileStore {
  private store!: JsonStore<ProfilesFile | TranslationProfile[]>;
  private profiles: TranslationProfile[] = [];

  async initialize(): Promise<void> {
    this.store = new JsonStore(join(app.getPath("userData"), "profiles.json"), { schemaVersion: 1, profiles: [] }, {
      backup: true,
      validate: isStoredProfiles
    });
    const raw = await this.store.read() as ProfilesFile | TranslationProfile[];
    const legacy = Array.isArray(raw);
    this.profiles = (legacy ? raw : (raw.profiles ?? [])).map(normalizeProfile);
    if (legacy) await this.persist();
  }

  private async persist(): Promise<void> {
    await this.store.write({ schemaVersion: 1, profiles: this.profiles });
  }

  list(): TranslationProfile[] { return structuredClone([...BUILT_INS, ...this.profiles]); }
  get(id?: string): TranslationProfile | undefined { return this.list().find((profile) => profile.id === id); }
  async upsert(profile: TranslationProfile): Promise<TranslationProfile> {
    if (profile.isBuiltIn) throw new Error("内置 Profile 请先复制后再修改。");
    if (!profile.id || !profile.name.trim() || !profile.systemPrompt.trim()) throw new Error("Profile 名称和提示词不能为空。");
    if (profile.temperature !== undefined && (!Number.isFinite(profile.temperature) || profile.temperature < 0 || profile.temperature > 2)) throw new Error("Profile 温度必须在 0 到 2 之间。");
    const normalized = normalizeProfile(profile);
    const index = this.profiles.findIndex((item) => item.id === normalized.id);
    if (index < 0) this.profiles.unshift(normalized); else this.profiles[index] = normalized;
    await this.persist();
    return structuredClone(normalized);
  }
  async delete(id: string): Promise<void> {
    this.profiles = this.profiles.filter((profile) => profile.id !== id);
    await this.persist();
  }
  async clear(): Promise<void> {
    this.profiles = [];
    await this.persist();
  }
}
