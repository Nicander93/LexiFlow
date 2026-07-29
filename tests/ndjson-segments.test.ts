import { describe, expect, it } from "vitest";
import { assembleSegmentsFromTargets, NdjsonSegmentParser } from "../electron/main/core/ndjson-segments";
import type { SourceSegment } from "../electron/shared/types";

const sources: SourceSegment[] = [
  { id: "segment-1", source: "Hello", sourceStart: 0, sourceEnd: 5 },
  { id: "segment-2", source: "World", sourceStart: 6, sourceEnd: 11 }
];

describe("NDJSON 句段流式解析", () => {
  it("按完整行增量解析句段，忽略非法行", () => {
    const parser = new NdjsonSegmentParser();
    const ids = new Set(sources.map((item) => item.id));
    expect(parser.push('{"id":"segment-1","target":"你好"}\n{"id":"segment-2",', ids)).toEqual([
      { id: "segment-1", source: "", sourceStart: 0, sourceEnd: 0, target: "你好" }
    ]);
    expect(parser.push('"target":"世界"}\n', ids).map((item) => item.target)).toEqual(["世界"]);
    expect(parser.getCompleted().size).toBe(2);
    expect(parser.missing(sources)).toEqual([]);
  });

  it("停止后不再追加：重复 id 被忽略", () => {
    const parser = new NdjsonSegmentParser();
    const ids = new Set(["segment-1"]);
    parser.push('{"id":"segment-1","target":"一"}\n', ids);
    expect(parser.push('{"id":"segment-1","target":"二"}\n', ids)).toEqual([]);
    expect(parser.getCompleted().get("segment-1")).toBe("一");
  });

  it("部分句段成功时可组装结果", () => {
    const targets = new Map([["segment-1", "你好"]]);
    const segments = assembleSegmentsFromTargets(sources, targets);
    expect(segments[0]?.target).toBe("你好");
    expect(segments[1]?.target).toBe("");
  });
});
