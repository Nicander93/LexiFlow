/** 匿名非致命错误计数，不含用户文本或密钥。 */
const nonFatalCounts: Record<string, number> = {};

export function recordNonFatalError(code: string, error?: unknown): void {
  nonFatalCounts[code] = (nonFatalCounts[code] ?? 0) + 1;
  const detail = error instanceof Error ? error.message : error;
  console.warn(`[non-fatal] ${code}`, detail);
}

export function getNonFatalErrorCounts(): Record<string, number> {
  return { ...nonFatalCounts };
}

/** 历史写入失败不得阻断翻译成功；返回 warning 文案供 UI 非阻断提示。 */
export async function persistHistorySafely(persist: () => Promise<void>): Promise<string | undefined> {
  try {
    await persist();
    return undefined;
  } catch (error) {
    recordNonFatalError("history-write-failed", error);
    return "翻译成功，但历史记录保存失败。";
  }
}
