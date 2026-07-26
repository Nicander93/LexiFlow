import type { SourceSegment } from "../../shared/types";

const PROTECTED_TOKEN = /https?:\/\/[^\s<>"'`]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:[A-Za-z]:\\|\\\\)[^\s<>"'`]+|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\b(?:[A-Za-z]\.){2,}|\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e)\./y;
const OPENING_PARENS = new Set(["(", "[", "（", "【", "{"]);
const CLOSING_PARENS = new Set([")", "]", "）", "】", "}"]);

function isSentenceBoundary(text: string, index: number): boolean {
  const char = text[index];
  if ("。！？；：!?;:".includes(char)) return true;
  if (char !== ".") return false;
  const previous = text[index - 1] ?? "";
  const next = text[index + 1] ?? "";
  return !/[0-9]/.test(previous) && (!next || /\s|[”）)]/.test(next));
}

function appendSegment(text: string, start: number, end: number, output: SourceSegment[]): void {
  let sourceStart = start;
  let sourceEnd = end;
  while (sourceStart < sourceEnd && /\s/.test(text[sourceStart])) sourceStart += 1;
  while (sourceEnd > sourceStart && /\s/.test(text[sourceEnd - 1])) sourceEnd -= 1;
  if (sourceStart === sourceEnd) return;
  output.push({
    id: `segment-${output.length + 1}`,
    source: text.slice(sourceStart, sourceEnd),
    sourceStart,
    sourceEnd
  });
}

function isLongSegment(text: string): boolean {
  const chineseCharacters = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const englishWords = text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0;
  return chineseCharacters > 50 || englishWords > 30;
}

function hasUsefulClauseLength(text: string): boolean {
  const chineseCharacters = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const englishWords = text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0;
  return chineseCharacters >= 15 || englishWords >= 8;
}

function findClauseBoundaries(text: string, start: number, end: number): number[] {
  const boundaries: number[] = [];
  let clauseStart = start;
  let parenthesesDepth = 0;

  for (let index = start; index < end; index += 1) {
    if (text.startsWith("```", index)) return [];
    PROTECTED_TOKEN.lastIndex = index;
    const protectedToken = PROTECTED_TOKEN.exec(text);
    if (protectedToken?.index === index) {
      index += protectedToken[0].length - 1;
      continue;
    }
    const char = text[index];
    if (OPENING_PARENS.has(char)) {
      parenthesesDepth += 1;
      continue;
    }
    if (parenthesesDepth > 0 && CLOSING_PARENS.has(char)) {
      parenthesesDepth -= 1;
      continue;
    }
    if (parenthesesDepth === 0 && (char === "," || char === "，")) {
      const boundary = index + 1;
      if (hasUsefulClauseLength(text.slice(clauseStart, boundary))) {
        boundaries.push(boundary);
        clauseStart = boundary;
      }
    }
  }
  return boundaries;
}

function pushSegment(text: string, start: number, end: number, output: SourceSegment[]): void {
  let sourceStart = start;
  let sourceEnd = end;
  while (sourceStart < sourceEnd && /\s/.test(text[sourceStart])) sourceStart += 1;
  while (sourceEnd > sourceStart && /\s/.test(text[sourceEnd - 1])) sourceEnd -= 1;
  if (sourceStart === sourceEnd) return;

  const source = text.slice(sourceStart, sourceEnd);
  const boundaries = isLongSegment(source) ? findClauseBoundaries(text, sourceStart, sourceEnd) : [];
  let clauseStart = sourceStart;
  for (const boundary of boundaries) {
    appendSegment(text, clauseStart, boundary, output);
    clauseStart = boundary;
  }
  appendSegment(text, clauseStart, sourceEnd, output);
}

/** Splits stable semantic clauses without relying on visual line wrapping. */
export function splitIntoSegments(text: string): SourceSegment[] {
  const segments: SourceSegment[] = [];
  let start = 0;
  let parenthesesDepth = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (text.startsWith("```", index)) {
      const close = text.indexOf("```", index + 3);
      index = close >= 0 ? close + 2 : text.length - 1;
      continue;
    }
    PROTECTED_TOKEN.lastIndex = index;
    const protectedToken = PROTECTED_TOKEN.exec(text);
    if (protectedToken?.index === index) {
      const token = protectedToken[0];
      const isUrlOrPath = /^(https?:\/\/|(?:[A-Za-z]:\\|\\\\))/.test(token);
      const protectedLength = isUrlOrPath ? token.replace(/[.。！？!?;:]+$/, "").length : token.length;
      index += Math.max(protectedLength, 1) - 1;
      continue;
    }

    const char = text[index];
    if (OPENING_PARENS.has(char)) {
      parenthesesDepth += 1;
      continue;
    }
    if (parenthesesDepth > 0 && CLOSING_PARENS.has(char)) {
      parenthesesDepth -= 1;
      continue;
    }
    if (parenthesesDepth > 0) continue;
    if (char === "\n" && text[index + 1] === "\n") {
      pushSegment(text, start, index, segments);
      while (text[index + 1] === "\n") index += 1;
      start = index + 1;
      continue;
    }
    if (isSentenceBoundary(text, index)) {
      pushSegment(text, start, index + 1, segments);
      start = index + 1;
    }
  }

  pushSegment(text, start, text.length, segments);
  return segments;
}
