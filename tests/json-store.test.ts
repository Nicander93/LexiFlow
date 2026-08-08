import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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

  it("隔离损坏 JSON，而不是静默覆盖原文件", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lexiflow-json-corrupt-"));
    dirs.push(dir);
    const filePath = join(dir, "history.json");
    await writeFile(filePath, "{broken", "utf8");
    const store = new JsonStore(filePath, { items: [] }, { backup: true });
    expect(await store.read()).toEqual({ items: [] });
    const files = await readdir(dir);
    expect(files.some((file) => file.startsWith("history.json.corrupt."))).toBe(true);
  });

  it("schema validation isolates valid JSON with an invalid shape", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lexiflow-json-schema-"));
    dirs.push(dir);
    const filePath = join(dir, "settings.json");
    await writeFile(filePath, JSON.stringify({ provider: "not-an-object" }), "utf8");
    const store = new JsonStore(filePath, { provider: {} }, {
      backup: true,
      validate: (value): value is { provider: Record<string, unknown> } =>
        Boolean(value) && typeof value === "object" && !Array.isArray(value)
          && typeof (value as { provider?: unknown }).provider === "object"
    });

    expect(await store.read()).toEqual({ provider: {} });
    const files = await readdir(dir);
    expect(files.some((file) => file.startsWith("settings.json.corrupt."))).toBe(true);
  });
});
