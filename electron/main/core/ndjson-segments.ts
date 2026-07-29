import type { SourceSegment, TranslationSegment } from "../../shared/types";

/** 流式 NDJSON：按完整行解析句段，忽略非法行。 */
export class NdjsonSegmentParser {
  private buffer = "";
  private readonly completed = new Map<string, string>();

  push(chunk: string, expectedIds: ReadonlySet<string>): TranslationSegment[] {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    const emitted: TranslationSegment[] = [];
    for (const line of lines) {
      const segment = this.parseLine(line, expectedIds);
      if (segment) emitted.push(segment);
    }
    return emitted;
  }

  finish(expectedIds: ReadonlySet<string>): TranslationSegment[] {
    const tail = this.parseLine(this.buffer, expectedIds);
    this.buffer = "";
    return tail ? [tail] : [];
  }

  getCompleted(): Map<string, string> {
    return new Map(this.completed);
  }

  missing(sourceSegments: SourceSegment[]): SourceSegment[] {
    return sourceSegments.filter((segment) => !this.completed.has(segment.id));
  }

  private parseLine(line: string, expectedIds: ReadonlySet<string>): TranslationSegment | undefined {
    const trimmed = line.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    if (!trimmed || trimmed === "[" || trimmed === "]" || trimmed === ",") return undefined;
    try {
      const value = JSON.parse(trimmed) as { id?: unknown; target?: unknown };
      if (typeof value.id !== "string" || typeof value.target !== "string" || !value.target.trim()) return undefined;
      if (!expectedIds.has(value.id) || this.completed.has(value.id)) return undefined;
      this.completed.set(value.id, value.target.trim());
      return {
        id: value.id,
        source: "",
        sourceStart: 0,
        sourceEnd: 0,
        target: value.target.trim()
      };
    } catch {
      return undefined;
    }
  }
}

export function assembleSegmentsFromTargets(
  sourceSegments: SourceSegment[],
  targets: Map<string, string>
): TranslationSegment[] {
  let targetOffset = 0;
  return sourceSegments.map((source) => {
    const target = targets.get(source.id) ?? "";
    const targetStart = targetOffset;
    targetOffset += target.length;
    const segment: TranslationSegment = { ...source, target, targetStart, targetEnd: targetOffset };
    targetOffset += 1;
    return segment;
  });
}

export function buildMissingSegmentsPrompt(
  missing: SourceSegment[],
  targetLanguageLabel: string
): { system: string; user: string } {
  return {
    system: "补译缺失句段。逐行返回 NDJSON：每行 {\"id\":\"segment ID\",\"target\":\"译文\"}。不要数组，不要 Markdown。",
    user: `目标语言：${targetLanguageLabel}\n\n${JSON.stringify({ segments: missing.map(({ id, source }) => ({ id, source })) })}`
  };
}
