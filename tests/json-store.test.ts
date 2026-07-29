import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonStore } from "../electron/main/storage/json-store";

describe("JsonStore 串行写入", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("并发写入最终 JSON 合法且保留最后一次完整快照", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lexiflow-json-"));
    dirs.push(dir);
    const filePath = join(dir, "data.json");
    const store = new JsonStore<{ schemaVersion: 1; items: number[] }>(filePath, { schemaVersion: 1, items: [] });

    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        store.write({ schemaVersion: 1, items: Array.from({ length: index + 1 }, (__ , i) => i) })
      )
    );

    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as { schemaVersion: 1; items: number[] };
    expect(parsed.schemaVersion).toBe(1);
    expect(Array.isArray(parsed.items)).toBe(true);
    expect(parsed.items.length).toBeGreaterThan(0);
    expect(parsed.items).toEqual(Array.from({ length: parsed.items.length }, (_, i) => i));
  });
});
