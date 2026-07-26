import type {
  DictionaryLookupRequest,
  DictionaryLookupResult,
  DictionaryStatus
} from "../../shared/types";
import { resolveDictionaryDatabasePath } from "./dictionary-path";
import { EcdictRepository, type DictionaryRepository } from "./ecdict-repository";
import { normalizeDictionaryQuery, stripWordKey } from "./normalize-query";
import { toDictionaryEntry } from "./parse-entry";

const MAX_QUERY_LENGTH = 128;

export class DictionaryService {
  private repository: DictionaryRepository;
  private initialized = false;

  constructor(repository?: DictionaryRepository) {
    this.repository = repository ?? new EcdictRepository(resolveDictionaryDatabasePath());
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      this.repository.initialize();
    } catch {
      // Repository marks itself unavailable; startup must continue.
    }
    this.initialized = true;
  }

  getStatus(): DictionaryStatus {
    return this.repository.getStatus();
  }

  lookup(request: DictionaryLookupRequest): DictionaryLookupResult {
    const query = typeof request?.query === "string" ? request.query : "";
    const normalizedQuery = normalizeDictionaryQuery(query).slice(0, MAX_QUERY_LENGTH);
    const empty: DictionaryLookupResult = {
      query,
      normalizedQuery,
      found: false,
      matchType: "none",
      suggestions: []
    };

    if (!normalizedQuery) return empty;

    const status = this.repository.getStatus();
    if (!status.available) {
      return {
        ...empty,
        unavailableReason: status.message ?? "本地词典资源不可用，仍可使用 AI 翻译。"
      };
    }

    try {
      const exact = this.repository.findExact(query.trim());
      if (exact) {
        return {
          query,
          normalizedQuery,
          found: true,
          matchType: "exact",
          entry: toDictionaryEntry(exact),
          suggestions: []
        };
      }

      const sameAsNormalized = query.trim() === normalizedQuery;
      if (!sameAsNormalized) {
        const normalizedHit = this.repository.findExact(normalizedQuery);
        if (normalizedHit) {
          return {
            query,
            normalizedQuery,
            found: true,
            matchType: "normalized",
            entry: toDictionaryEntry(normalizedHit),
            suggestions: []
          };
        }
      }

      const lemma = this.repository.findLemma(normalizedQuery);
      if (lemma) {
        return {
          query,
          normalizedQuery,
          found: true,
          matchType: "lemma",
          entry: toDictionaryEntry(lemma),
          suggestions: []
        };
      }

      const sw = stripWordKey(normalizedQuery);
      const candidates = this.repository.findByStripKey(sw, 5);
      if (candidates.length === 1) {
        return {
          query,
          normalizedQuery,
          found: true,
          matchType: "fuzzy",
          entry: toDictionaryEntry(candidates[0]),
          suggestions: []
        };
      }
      if (candidates.length > 1) {
        return {
          query,
          normalizedQuery,
          found: false,
          matchType: "none",
          suggestions: candidates.map((item) => item.word).slice(0, 5)
        };
      }

      return empty;
    } catch {
      return {
        ...empty,
        unavailableReason: "词典查询失败，请使用 AI 翻译或重新启动应用。"
      };
    }
  }

  close(): void {
    this.repository.close();
  }
}
