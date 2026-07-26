import { describe, expect, it } from "vitest";
import { parseSegmentAlternatives } from "../electron/main/translation/alternatives";

describe("候选译法解析", () => {
  it("仅接受三种完整且不重复的候选标签", () => {
    const parsed = parseSegmentAlternatives('{"alternatives":[{"label":"推荐译法","target":"推荐","description":"自然"},{"label":"直译","target":"直译","description":"保留结构"},{"label":"正式表达","target":"正式","description":"报告"}]}');
    expect(parsed?.map((item) => item.label)).toEqual(["推荐译法", "直译", "正式表达"]);
    expect(parseSegmentAlternatives('{"alternatives":[{"label":"推荐译法","target":"x","description":"x"}]}')).toBeNull();
  });
});
