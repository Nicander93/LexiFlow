import { describe, expect, it } from "vitest";
import { shouldLookupDictionary } from "../electron/shared/dictionary-eligibility";

describe("legacy dictionary smoke", () => {
  it("keeps eligibility helper available for renderer and main", () => {
    expect(shouldLookupDictionary("translation")).toBe(true);
  });
});
