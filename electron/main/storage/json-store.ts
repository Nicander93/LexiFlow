import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface JsonStoreOptions<T> {
  backup?: boolean;
  validate?: (value: unknown) => value is T;
  onCorrupt?: (corruptPath: string) => void;
}

export class JsonStore<T> {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly fallback: T,
    private readonly options: JsonStoreOptions<T> = {}
  ) {}

  async read(): Promise<T> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, "utf8"));
      if (this.options.validate && !this.options.validate(parsed)) throw new SyntaxError("Stored JSON failed schema validation.");
      return parsed as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(this.fallback);
      if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === "ERR_INVALID_ARG_TYPE") {
        const corruptPath = `${this.filePath}.corrupt.${Date.now()}.json`;
        await rename(this.filePath, corruptPath).catch(() => undefined);
        this.options.onCorrupt?.(corruptPath);
        return structuredClone(this.fallback);
      }
      throw error;
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
    if (this.options.backup) {
      await copyFile(this.filePath, `${this.filePath}.bak`).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, JSON.stringify(value, null, 2), "utf8");
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await rename(temporaryPath, `${temporaryPath}.failed`).catch(() => undefined);
      throw error;
    }
  }
}
