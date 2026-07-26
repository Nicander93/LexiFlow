import { describe, expect, it } from "vitest";
import { normalizeDictionaryQuery, stripWordKey } from "../electron/main/dictionary/normalize-query";

describe("dictionary normalize", () => {
  it("trims punctuation and whitespace", () => {
    expect(normalizeDictionaryQuery(" Sorry! ")).toBe("Sorry");
  });

  it("normalizes curly apostrophes", () => {
    expect(normalizeDictionaryQuery("don’t")).toBe("don't");
  });

  it("normalizes unicode hyphens", () => {
    expect(normalizeDictionaryQuery("long–time")).toBe("long-time");
  });

  it("keeps technical casing", () => {
    expect(normalizeDictionaryQuery("GeoJSON")).toBe("GeoJSON");
  });

  it("builds strip keys without punctuation", () => {
    expect(stripWordKey("long-time")).toBe("longtime");
    expect(stripWordKey("long time")).toBe("longtime");
  });
});
