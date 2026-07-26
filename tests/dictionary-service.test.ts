import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DictionaryService } from "../electron/main/dictionary/dictionary-service";
import { EcdictRepository } from "../electron/main/dictionary/ecdict-repository";

const sampleCsv = join(process.cwd(), "tests/fixtures/ecdict-sample.csv");
const allowlist = join(process.cwd(), "resources/dictionaries/core-allowlist.txt");

describe("dictionary service", () => {
  let tempDir = "";
  let dbPath = "";
  let service: DictionaryService;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "lexiflow-dict-"));
    dbPath = join(tempDir, "ecdict-core.db");
    execFileSync(
      "python",
      [
        join(process.cwd(), "scripts/dictionary/build_ecdict.py"),
        "--input",
        sampleCsv,
        "--output",
        dbPath,
        "--allowlist",
        allowlist,
        "--dictionary-version",
        "test"
      ],
      { stdio: "pipe" }
    );
    service = new DictionaryService(new EcdictRepository(dbPath));
    await service.initialize();
  });

  afterEach(() => {
    service.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("finds exact matches", () => {
    const result = service.lookup({ query: "sorry" });
    expect(result.found).toBe(true);
    expect(result.matchType).toBe("exact");
    expect(result.entry?.headword).toBe("sorry");
    expect(result.entry?.senses.some((sense) => sense.partOfSpeech === "adj.")).toBe(true);
  });

  it("finds normalized matches", () => {
    const result = service.lookup({ query: " Sorry! " });
    expect(result.found).toBe(true);
    expect(result.matchType).toBe("normalized");
    expect(result.entry?.headword).toBe("sorry");
  });

  it("falls back through lemma forms", () => {
    expect(service.lookup({ query: "went" })).toMatchObject({ found: true, matchType: "lemma", entry: { headword: "go" } });
    expect(service.lookup({ query: "perceived" })).toMatchObject({ found: true, matchType: "lemma", entry: { headword: "perceive" } });
    expect(service.lookup({ query: "teeth" })).toMatchObject({ found: true, matchType: "lemma", entry: { headword: "tooth" } });
  });

  it("returns suggestions for ambiguous strip-key matches", () => {
    const result = service.lookup({ query: "longtime" });
    expect(result.found).toBe(false);
    expect(result.matchType).toBe("none");
    expect(result.suggestions).toEqual(expect.arrayContaining(["long time", "long-time"]));
  });

  it("returns not found for unknown words", () => {
    const result = service.lookup({ query: "zzzznotaword" });
    expect(result).toMatchObject({ found: false, matchType: "none", suggestions: [] });
  });

  it("degrades when database is unavailable", async () => {
    const missing = new DictionaryService(new EcdictRepository(join(tempDir, "missing.db")));
    await missing.initialize();
    expect(missing.getStatus().available).toBe(false);
    const result = missing.lookup({ query: "sorry" });
    expect(result.found).toBe(false);
    expect(result.unavailableReason).toBeTruthy();
    missing.close();
  });
});
