import { describe, expect, it } from "vitest";
import { pickTargetDictionaryQuery, shouldLookupDictionary } from "../electron/shared/dictionary-eligibility";

describe("dictionary eligibility", () => {
  it("allows words and short phrases", () => {
    for (const text of ["sorry", "don't", "long-time", "community service", "GeoJSON"]) {
      expect(shouldLookupDictionary(text), text).toBe(true);
    }
  });

  it("rejects chinese, sentences, urls, paths and code", () => {
    for (const text of [
      "你好",
      "This is a complete English paragraph that should not be looked up.",
      "line one\nline two",
      "https://example.com",
      "C:\\work\\file.txt",
      "const value = foo();"
    ]) {
      expect(shouldLookupDictionary(text), text).toBe(false);
    }
  });
});

describe("pickTargetDictionaryQuery", () => {
  it("uses single segment target when eligible", () => {
    expect(pickTargetDictionaryQuery([{ target: "test" }], "ignored")).toBe("test");
  });

  it("uses full text when multiple segments", () => {
    expect(pickTargetDictionaryQuery(
      [{ target: "hello" }, { target: "world" }],
      "hello world"
    )).toBe("hello world");
  });

  it("returns undefined for chinese or long ineligible text", () => {
    expect(pickTargetDictionaryQuery([{ target: "测试" }], "测试")).toBeUndefined();
    expect(pickTargetDictionaryQuery(
      [{ target: "a" }, { target: "b" }],
      "This is a complete English paragraph that should not be looked up."
    )).toBeUndefined();
  });
});
