import { beforeEach, describe, expect, it } from "vitest";
import {
  buildStructuredRepairPrompt,
  fallbackSegmentTargetText,
  getStructuredParseFailureCounts,
  recordStructuredParseFailure,
  resetStructuredParseFailureCounts,
  validateAlternativesResponse,
  validateNamingResponse,
  validateSegmentResponse
} from "../electron/main/core/structured";
import { createTranslationResult } from "../electron/main/translation/result";
import { splitIntoSegments } from "../electron/main/translation/segments";

describe("结构化输出校验与一次修复回退", () => {
  beforeEach(() => resetStructuredParseFailureCounts());

  const sourceSegments = splitIntoSegments("One. Two.");

  it("句段：合法 JSON 通过；非法 JSON / 缺 ID / 重复 ID 失败", () => {
    expect(validateSegmentResponse(
      '{"segments":[{"id":"segment-1","target":"一。"},{"id":"segment-2","target":"二。"}]}',
      sourceSegments
    ).ok).toBe(true);
    expect(validateSegmentResponse("not-json", sourceSegments)).toMatchObject({ ok: false, reason: "invalid-json" });
    expect(validateSegmentResponse(
      '{"segments":[{"id":"segment-1","target":"一。"}]}',
      sourceSegments
    )).toMatchObject({ ok: false, reason: "count-mismatch" });
    expect(validateSegmentResponse(
      '{"segments":[{"id":"segment-1","target":"一。"},{"id":"segment-1","target":"二。"}]}',
      sourceSegments
    )).toMatchObject({ ok: false, reason: "duplicate-id" });
    expect(validateSegmentResponse(
      '{"segments":[{"id":"segment-9","target":"一。"},{"id":"segment-2","target":"二。"}]}',
      sourceSegments
    )).toMatchObject({ ok: false, reason: "missing-id" });
  });

  it("校验失败时可抽出 target 作为可读全文，不重建 segments", () => {
    expect(fallbackSegmentTargetText('{"segments":[{"id":"segment-1","target":"一。"},{"id":"x","target":"二。"}]}')).toBe("一。\n二。");
    expect(fallbackSegmentTargetText("普通译文")).toBeNull();
    expect(fallbackSegmentTargetText('{"segments":[]}')).toBeNull();
    const result = createTranslationResult({
      requestId: "r-fallback",
      sourceText: "One. Two.",
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
      sourceSegments,
      modelInfo: { provider: "ollama", model: "qwen3", durationMs: 1 },
      responseText: '{"segments":[{"id":"segment-1","target":"一。"},{"id":"segment-9","target":"二。"}]}'
    });
    expect(result.segments).toEqual([]);
    expect(result.targetText).toBe("一。\n二。");
  });

  it("候选：非法标签或数量不符失败；三种标签通过", () => {
    expect(validateAlternativesResponse(
      '{"alternatives":[{"label":"推荐译法","target":"a","description":"d"},{"label":"直译","target":"b","description":"d"},{"label":"正式表达","target":"c","description":"d"}]}',
      () => "id"
    ).ok).toBe(true);
    expect(validateAlternativesResponse(
      '{"alternatives":[{"label":"自然","target":"a","description":"d"},{"label":"直译","target":"b","description":"d"},{"label":"正式表达","target":"c","description":"d"}]}',
      () => "id"
    )).toMatchObject({ ok: false, reason: "invalid-label" });
    expect(validateAlternativesResponse('{"alternatives":[]}', () => "id")).toMatchObject({ ok: false, reason: "count-mismatch" });
  });

  it("命名：缺字段或空候选失败；合法结构通过", () => {
    expect(validateNamingResponse('{"recommended":"foo","candidates":[{"name":"foo","meaning":"条"}]}').ok).toBe(true);
    expect(validateNamingResponse("oops")).toMatchObject({ ok: false, reason: "invalid-json" });
    expect(validateNamingResponse('{"recommended":"foo","candidates":[]}')).toMatchObject({ ok: false, reason: "empty" });
  });

  it("修复提示只携带原始响应与 schema，不含额外用户原文字段名约定外内容", () => {
    const prompt = buildStructuredRepairPrompt("segments", '{"broken":true}');
    expect(prompt.system).toContain("schema");
    expect(prompt.user).toContain('{"broken":true}');
    expect(prompt.user).not.toContain("One. Two.");
  });

  it("解析失败只累计匿名计数", () => {
    recordStructuredParseFailure("segments", "invalid-json");
    recordStructuredParseFailure("segments", "invalid-json");
    recordStructuredParseFailure("alternatives", "invalid-label");
    expect(getStructuredParseFailureCounts()).toEqual({
      "segments:invalid-json": 2,
      "alternatives:invalid-label": 1
    });
  });

  it("二次失败时 createTranslationResult 安全回退为普通全文，不留空 segments 以外的空白译文", () => {
    const result = createTranslationResult({
      requestId: "r1",
      sourceText: "One. Two.",
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
      sourceSegments,
      modelInfo: { provider: "ollama", model: "qwen3", durationMs: 1 },
      responseText: "普通回退译文"
    });
    expect(result.segments).toEqual([]);
    expect(result.targetText).toBe("普通回退译文");
  });
});
