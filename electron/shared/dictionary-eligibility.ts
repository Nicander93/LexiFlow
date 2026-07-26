const HAS_LATIN = /[A-Za-z]/;
const HAS_CJK = /[\u4e00-\u9fff]/;
const LOOKS_LIKE_URL = /https?:\/\/|www\./i;
const LOOKS_LIKE_PATH = /^[A-Za-z]:\\|\\\\|\/(?:usr|home|var|tmp|etc)\//i;
const LOOKS_LIKE_CODE = /[{}();=<>]|=>|::|\b(?:const|let|var|function|return|class|import|export)\b/;
const SENTENCE_END = /[.!?]。/;

export function shouldLookupDictionary(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length > 64) return false;
  if (!HAS_LATIN.test(trimmed)) return false;
  if (HAS_CJK.test(trimmed)) return false;
  if (trimmed.includes("\n") || trimmed.includes("\r")) return false;
  if (LOOKS_LIKE_URL.test(trimmed)) return false;
  if (LOOKS_LIKE_PATH.test(trimmed)) return false;
  if (LOOKS_LIKE_CODE.test(trimmed)) return false;

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length > 4) return false;

  if (tokens.length >= 3 && SENTENCE_END.test(trimmed)) return false;
  if (tokens.length >= 4 && /^(the|a|an|this|that|these|those|i|we|you|he|she|they)\b/i.test(trimmed)) {
    return false;
  }

  return true;
}
