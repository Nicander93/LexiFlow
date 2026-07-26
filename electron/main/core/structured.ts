import type { NamingResult, SegmentAlternative, SourceSegment, TranslationSegment } from "../../shared/types";

export type StructuredKind = "segments" | "alternatives" | "naming";

export interface StructuredParseFailure {
  ok: false;
  kind: StructuredKind;
  reason: "invalid-json" | "missing-field" | "missing-id" | "duplicate-id" | "invalid-label" | "count-mismatch" | "empty";
}

export interface SegmentsParseOk {
  ok: true;
  kind: "segments";
  segments: TranslationSegment[];
  targetText: string;
}

export interface AlternativesParseOk {
  ok: true;
  kind: "alternatives";
  alternatives: SegmentAlternative[];
}

export interface NamingParseOk {
  ok: true;
  kind: "naming";
  result: NamingResult;
}

export type StructuredParseResult = SegmentsParseOk | AlternativesParseOk | NamingParseOk | StructuredParseFailure;

const ALT_LABELS = ["推荐译法", "直译", "正式表达"] as const;

/** Anonymous local counters only — never store user text or keys. */
const parseFailureCounts: Record<string, number> = {};

export function recordStructuredParseFailure(kind: StructuredKind, reason: StructuredParseFailure["reason"]): void {
  const key = `${kind}:${reason}`;
  parseFailureCounts[key] = (parseFailureCounts[key] ?? 0) + 1;
}

export function getStructuredParseFailureCounts(): Record<string, number> {
  return { ...parseFailureCounts };
}

export function resetStructuredParseFailureCounts(): void {
  for (const key of Object.keys(parseFailureCounts)) delete parseFailureCounts[key];
}

function stripFence(content: string): string {
  return content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function parseJson(content: string): { ok: true; value: unknown } | { ok: false; reason: "invalid-json" } {
  try {
    return { ok: true, value: JSON.parse(stripFence(content)) };
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
}

export function validateSegmentResponse(content: string, sourceSegments: SourceSegment[]): SegmentsParseOk | StructuredParseFailure {
  const parsed = parseJson(content);
  if (!parsed.ok) return { ok: false, kind: "segments", reason: parsed.reason };
  if (!parsed.value || typeof parsed.value !== "object" || !Array.isArray((parsed.value as { segments?: unknown }).segments)) {
    return { ok: false, kind: "segments", reason: "missing-field" };
  }
  const returned = (parsed.value as { segments: Array<{ id?: unknown; target?: unknown }> }).segments;
  if (returned.length !== sourceSegments.length) return { ok: false, kind: "segments", reason: "count-mismatch" };

  const targets = new Map<string, string>();
  for (const segment of returned) {
    if (typeof segment.id !== "string" || typeof segment.target !== "string" || !segment.target.trim()) {
      return { ok: false, kind: "segments", reason: "missing-id" };
    }
    if (targets.has(segment.id)) return { ok: false, kind: "segments", reason: "duplicate-id" };
    targets.set(segment.id, segment.target.trim());
  }
  if (sourceSegments.some((segment) => !targets.has(segment.id))) return { ok: false, kind: "segments", reason: "missing-id" };

  let targetOffset = 0;
  const segments = sourceSegments.map((source) => {
    const target = targets.get(source.id)!;
    const targetStart = targetOffset;
    targetOffset += target.length;
    const result: TranslationSegment = { ...source, target, targetStart, targetEnd: targetOffset };
    targetOffset += 1;
    return result;
  });
  return { ok: true, kind: "segments", segments, targetText: segments.map((segment) => segment.target).join("\n") };
}

export function validateAlternativesResponse(content: string, createId: () => string): AlternativesParseOk | StructuredParseFailure {
  const parsed = parseJson(content);
  if (!parsed.ok) return { ok: false, kind: "alternatives", reason: parsed.reason };
  const raw = parsed.value as { alternatives?: Array<{ label?: unknown; target?: unknown; description?: unknown }> };
  if (!Array.isArray(raw.alternatives) || raw.alternatives.length !== 3) {
    return { ok: false, kind: "alternatives", reason: "count-mismatch" };
  }
  const seen = new Set<string>();
  const alternatives: SegmentAlternative[] = [];
  for (const item of raw.alternatives) {
    const label = item.label;
    if (typeof label !== "string" || !(ALT_LABELS as readonly string[]).includes(label)) {
      return { ok: false, kind: "alternatives", reason: "invalid-label" };
    }
    if (typeof item.target !== "string" || typeof item.description !== "string" || !item.target.trim() || seen.has(label)) {
      return { ok: false, kind: "alternatives", reason: seen.has(label) ? "duplicate-id" : "missing-field" };
    }
    seen.add(label);
    alternatives.push({
      id: createId(),
      label: label as (typeof ALT_LABELS)[number],
      target: item.target.trim(),
      description: item.description.trim()
    });
  }
  return { ok: true, kind: "alternatives", alternatives };
}

export function validateNamingResponse(content: string): NamingParseOk | StructuredParseFailure {
  const parsed = parseJson(content);
  if (!parsed.ok) return { ok: false, kind: "naming", reason: parsed.reason };
  if (!parsed.value || typeof parsed.value !== "object") return { ok: false, kind: "naming", reason: "missing-field" };
  const result = parsed.value as Partial<NamingResult>;
  if (typeof result.recommended !== "string" || !Array.isArray(result.candidates)) {
    return { ok: false, kind: "naming", reason: "missing-field" };
  }
  const candidates = result.candidates.filter(
    (candidate) => candidate && typeof candidate.name === "string" && typeof candidate.meaning === "string"
  );
  if (!candidates.length) return { ok: false, kind: "naming", reason: "empty" };
  return { ok: true, kind: "naming", result: { recommended: result.recommended, candidates } };
}

const SCHEMA_HINTS: Record<StructuredKind, string> = {
  segments: '合法 JSON：{"segments":[{"id":"segment-1","target":"译文"}]}，id 必须与输入完全一致且不重复。',
  alternatives: '合法 JSON：{"alternatives":[{"label":"推荐译法","target":"...","description":"..."},{"label":"直译","target":"...","description":"..."},{"label":"正式表达","target":"...","description":"..."}]}，三个标签各出现一次。',
  naming: '合法 JSON：{"recommended":"...","candidates":[{"name":"...","meaning":"..."}]}。'
};

/** Repair prompt sends only the raw model output + schema — never the original user text again. */
export function buildStructuredRepairPrompt(kind: StructuredKind, rawResponse: string): { system: string; user: string } {
  return {
    system: `你只负责把上一次模型输出修正为符合 schema 的 JSON。不要解释，不要 Markdown。${SCHEMA_HINTS[kind]}`,
    user: `上一次输出（可能不合法）：\n${rawResponse.slice(0, 8_000)}`
  };
}
