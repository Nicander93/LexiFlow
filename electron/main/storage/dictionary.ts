import { app } from "electron";
import { join } from "node:path";
import type { DictionaryEntry } from "../../shared/types";
import { JsonStore } from "./json-store";

const LOCAL_ENTRIES: DictionaryEntry[] = [
  { query: "translation", phonetic: "/trænzˈleɪʃn/", partOfSpeech: "noun", definitions: ["翻译；译文", "转化，转换"], forms: ["translate", "translated", "translating"], collocations: ["machine translation", "translation result"], source: "local" },
  { query: "translate", phonetic: "/trænzˈleɪt/", partOfSpeech: "verb", definitions: ["翻译；转译", "转化，解释"], forms: ["translates", "translated", "translating"], collocations: ["translate text", "translate into"], source: "local" },
  { query: "model", phonetic: "/ˈmɑːdl/", partOfSpeech: "noun", definitions: ["模型；范例", "模式，样式"], forms: ["models"], collocations: ["language model", "local model"], source: "local" },
  { query: "language", phonetic: "/ˈlæŋɡwɪdʒ/", partOfSpeech: "noun", definitions: ["语言", "表达方式；编程语言"], forms: ["languages"], collocations: ["target language", "programming language"], source: "local" },
  { query: "document", phonetic: "/ˈdɑːkjumənt/", partOfSpeech: "noun", definitions: ["文档；文件", "记录，证明材料"], forms: ["documents"], collocations: ["technical document", "source document"], source: "local" },
  { query: "code", phonetic: "/koʊd/", partOfSpeech: "noun", definitions: ["代码；编码", "准则，密码"], forms: ["codes", "coded", "coding"], collocations: ["source code", "code block"], source: "local" },
  { query: "read", phonetic: "/riːd/", partOfSpeech: "verb", definitions: ["阅读；读取", "理解，解读"], forms: ["reads", "reading", "read"], collocations: ["read text", "read a document"], source: "local" },
  { query: "machine translation", partOfSpeech: "noun phrase", definitions: ["机器翻译"], collocations: ["neural machine translation", "machine translation system"], source: "local" },
  { query: "language model", partOfSpeech: "noun phrase", definitions: ["语言模型"], collocations: ["large language model", "local language model"], source: "local" },
  { query: "source code", partOfSpeech: "noun phrase", definitions: ["源代码"], collocations: ["source code file", "open source code"], source: "local" },
  { query: "technical document", partOfSpeech: "noun phrase", definitions: ["技术文档"], collocations: ["technical document translation", "software technical document"], source: "local" }
];

export function lookupLocalDictionary(term: string): DictionaryEntry | undefined {
  const key = term.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  return LOCAL_ENTRIES.find((candidate) => candidate.query === key);
}

export class DictionaryService {
  private store!: JsonStore<Record<string, DictionaryEntry>>;
  private cache: Record<string, DictionaryEntry> = {};

  async initialize(): Promise<void> {
    this.store = new JsonStore(join(app.getPath("userData"), "dictionary-cache.json"), {});
    this.cache = await this.store.read();
  }

  async lookup(term: string): Promise<DictionaryEntry | undefined> {
    const key = term.trim().replace(/\s+/g, " ").toLocaleLowerCase();
    if (!key) return undefined;
    if (this.cache[key]) return structuredClone(this.cache[key]);
    const entry = lookupLocalDictionary(key);
    if (!entry) return undefined;
    this.cache[key] = entry;
    try {
      await this.store.write(this.cache);
    } catch {
      // The in-memory entry remains useful; a cache persistence failure must not
      // make a local dictionary lookup fail or affect translation.
    }
    return structuredClone(entry);
  }

  async clear(): Promise<void> { this.cache = {}; await this.store.write(this.cache); }
}
