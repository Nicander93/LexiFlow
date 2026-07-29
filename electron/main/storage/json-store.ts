import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class JsonStore<T> {
  private writeChain: Promise<void> = Promise.resolve();

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

  write(value: T): Promise<void> {
    const snapshot = structuredClone(value);
    const next = this.writeChain.then(
      () => this.writeInternal(snapshot),
      () => this.writeInternal(snapshot)
    );
    this.writeChain = next.catch(() => undefined);
    return next;
  }

  private async writeInternal(value: T): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(value, null, 2), "utf8");
    await rename(temporaryPath, this.filePath);
  }
}
