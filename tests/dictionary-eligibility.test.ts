import { describe, expect, it } from "vitest";
import { shouldLookupDictionary } from "../electron/shared/dictionary-eligibility";

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
