import type { AppSettings } from "./types";

/** 与结构化输出 / 历史条目绑定；改 prompt 规则或 JSON schema 时递增。 */
export const PROMPT_VERSION = "v3.1";

export const DEFAULT_PROMPTS = {
  normal: `你是一个专业翻译工具。请将输入内容翻译为目标语言。
要求：
1. 忠实保留原意，不总结、不解释、不增加信息。
2. 保留段落和换行。
3. 除译文外不要输出任何内容。`,
  technical: `你是一个面向软件开发和技术文档的专业翻译工具。
要求：
1. 忠实翻译，不总结、不解释。
2. 保留代码、变量名、方法名、类名、接口名。
3. 保留 URL、文件路径、命令、配置项和日志。
4. 保留 Markdown 和代码块格式。
5. 对技术术语使用准确、常见的表达；不确定的专有名词保留英文。
6. 除译文外不要输出其他内容。`,
  naming: `你是一个专业的软件工程命名助手。根据用户输入的中文语义，生成符合指定编程语言、命名类型和命名风格的英文名称。
要求：
1. 语义准确，避免拼音和无意义缩写。
2. 布尔变量使用合适的 is、has、can、should、exists、enabled 前缀。
3. 方法名使用动词开头，类名使用名词，不使用语言保留字。
4. 仅返回合法 JSON，不使用 Markdown 代码块。
5. JSON 格式为 {"recommended":"name","candidates":[{"name":"name","meaning":"中文含义"}]}。`
};

export const DEFAULT_SETTINGS: AppSettings = {
  provider: {
    type: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    model: "qwen3.5:9b",
    remoteUsageConfirmed: false,
    enableReasoning: false,
    timeoutMs: 60_000,
    stream: true,
    keepAlive: "5m"
  },
  shortcuts: {
    translation: "Ctrl+Alt+T",
    naming: "Ctrl+Alt+N",
    screenshot: "Ctrl+Alt+S",
    paused: false
  },
  translation: {
    targetLanguage: "auto",
    maxInputLength: 10_000,
    autoCleanText: true,
    preserveOriginalLineBreaks: false,
    protectCodeBlocks: true,
    normalPrompt: DEFAULT_PROMPTS.normal,
    technicalPrompt: DEFAULT_PROMPTS.technical,
    namingPrompt: DEFAULT_PROMPTS.naming
  },
  history: {
    enabled: true,
    maxItems: 100,
    retention: "forever"
  },
  routing: {
    enabled: false,
    shortTextMaxLength: 240,
    shortTextModel: "",
    documentModel: ""
  },
  window: {
    closeAction: "hide",
    autoHidePopup: true
  },
  startup: {
    enabled: false
  }
};
