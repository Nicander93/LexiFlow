import { describe, expect, it } from "vitest";
import { applyHistoryRetention, HISTORY_SCHEMA_VERSION, migrateHistory, searchHistory } from "../electron/main/storage/history-policy";
import type { HistorySettings, TranslationHistory } from "../electron/shared/types";

const settings: HistorySettings = { enabled: true, maxItems: 100, retention: "7d" };
const now = Date.UTC(2026, 6, 24);
const recent: TranslationHistory = {
  id: "recent", sourceText: "Read the documentation", resultText: "阅读文档", mode: "technical",
  sourceLanguage: "en", targetLanguage: "zh-CN", provider: "ollama", model: "qwen3",
  createdAt: new Date(now - 6 * 24 * 60 * 60 * 1_000).toISOString(), isFavorite: false
};
const old: TranslationHistory = { ...recent, id: "old", createdAt: new Date(now - 8 * 24 * 60 * 60 * 1_000).toISOString() };

describe("历史保留策略", () => {
  it("仅移除超过保留周期的项目，并兼容旧数据的收藏字段", () => {
    const legacy = { ...recent, id: "legacy" } as Omit<TranslationHistory, "isFavorite"> as TranslationHistory;
    expect(applyHistoryRetention([recent, old, legacy], settings, now)).toEqual([
      recent, { ...legacy, isFavorite: false }
    ]);
  });

  it("搜索同时匹配原文和译文且忽略大小写", () => {
    expect(searchHistory([recent, old], "DOCUMENTATION").map((item) => item.id)).toEqual(["recent", "old"]);
    expect(searchHistory([recent, old], "阅读").map((item) => item.id)).toEqual(["recent", "old"]);
  });

  it("将旧数组和 targetText 字段迁移为版本化存储", () => {
    const legacy = { ...recent, targetText: recent.resultText } as TranslationHistory & { targetText: string };
    delete (legacy as Partial<TranslationHistory>).resultText;
    const migration = migrateHistory([legacy]);
    expect(migration.migrated).toBe(true);
    expect(migration.data).toEqual({ schemaVersion: HISTORY_SCHEMA_VERSION, items: [recent] });
  });

  it("忽略无效条目，并接受当前版本的存储格式", () => {
    const migration = migrateHistory({ schemaVersion: HISTORY_SCHEMA_VERSION, items: [recent, { id: "broken" }] });
    expect(migration.migrated).toBe(true);
    expect(migration.data.items).toEqual([recent]);
  });
});
