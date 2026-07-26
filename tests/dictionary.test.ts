import { describe, expect, it } from "vitest";
import { lookupLocalDictionary } from "../electron/main/storage/dictionary";

describe("本地词典", () => {
  it("不依赖网络查询并忽略词条大小写", () => {
    expect(lookupLocalDictionary("TRANSLATION")).toMatchObject({ query: "translation", source: "local" });
    expect(lookupLocalDictionary("not-in-the-local-dictionary")).toBeUndefined();
  });

  it("支持以规范空白查询本地短语词条", () => {
    expect(lookupLocalDictionary("  machine   translation ")).toMatchObject({
      query: "machine translation",
      definitions: ["机器翻译"]
    });
  });
});
