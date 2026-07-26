const CURLY_APOSTROPHE = /[\u2018\u2019\u201B\u2032]/g;
const HYPHEN_VARIANTS = /[\u2010\u2011\u2012\u2013\u2014\u2212]/g;
const EDGE_PUNCT = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

export function normalizeDictionaryQuery(input: string): string {
  return input
    .normalize("NFKC")
    .trim()
    .replace(CURLY_APOSTROPHE, "'")
    .replace(HYPHEN_VARIANTS, "-")
    .replace(EDGE_PUNCT, "")
    .replace(/\s+/g, " ");
}

export function stripWordKey(word: string): string {
  return [...word].filter((ch) => /[0-9A-Za-z]/i.test(ch)).join("").toLowerCase();
}
