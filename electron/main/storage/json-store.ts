import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class JsonStore<T> {
  constructor(
    private readonly filePath: string,
    private readonly fallback: T
  ) {}

  async read(): Promise<T> {
    try {
      return JSON.parse(await readFile(this.filePath, "utf8")) as T;
    } catch {
      return structuredClone(this.fallback);
    }
  }

  async write(value: T): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(value, null, 2), "utf8");
    await rename(temporaryPath, this.filePath);
  }
}
