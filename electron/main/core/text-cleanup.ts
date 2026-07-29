import type { CleanupAction, PreparedTranslationInput } from "../../shared/types";

export interface TextCleanupOptions {
  preserveOriginalLineBreaks: boolean;
  protectCodeBlocks: boolean;
}

const MARKDOWN_STRUCTURE = /^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s)/;

/** Placeholder fenced code with private-use markers so line joining cannot split blocks. 用私用区字符占位，避免合并折行拆掉代码块。 */
function protectCodeBlocks(text: string): { text: string; restore: (value: string) => string } {
  const blocks: string[] = [];
  const protectedText = text.replace(/```[\s\S]*?```/g, (block) => {
    const marker = `\uE000${blocks.length}\uE001`;
    blocks.push(block);
    return marker;
  });
  return {
    text: protectedText,
    restore: (value) => value.replace(/\uE000(\d+)\uE001/g, (_marker, index: string) => blocks[Number(index)] ?? "")
  };
}

/** PDF/web copies often wrap one paragraph across lines; keep headings/lists/blank lines, join the rest. PDF/网页复制常拆行；标题列表和空行保留，其余拼回段落。 */
function joinWrappedLines(lines: string[]): string[] {
  const output: string[] = [];
  let paragraph = "";
  const flush = () => {
    if (paragraph) output.push(paragraph);
    paragraph = "";
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      if (output.at(-1) !== "") output.push("");
      continue;
    }
    if (MARKDOWN_STRUCTURE.test(line)) {
      flush();
      output.push(line.trimEnd());
      continue;
    }
    if (!paragraph) {
      paragraph = trimmed;
      continue;
    }
    if (/[A-Za-z]-$/.test(paragraph) && /^[a-z]/.test(trimmed)) {
      paragraph = `${paragraph.slice(0, -1)}${trimmed}`;
    } else {
      paragraph = `${paragraph} ${trimmed}`;
    }
  }
  flush();
  return output;
}

/** Normalizes copied text while keeping paragraphs, Markdown structure and fenced code intact. 规范化粘贴文本；可关折行合并，或保护代码块后再还原。 */
export function cleanInputText(text: string, options: TextCleanupOptions): string {
  return prepareTranslationInput(text, options).normalizedText;
}

/** 保留原始文本与清理动作，供 UI 追溯与撤销。 */
export function prepareTranslationInput(text: string, options: TextCleanupOptions): PreparedTranslationInput {
  const actions: CleanupAction[] = [];
  const withBreaks = text.replace(/\r\n?/g, "\n");
  if (withBreaks !== text) {
    actions.push({ type: "normalize-line-breaks", description: "统一换行符" });
  }
  const withoutZw = withBreaks.replace(/[\u200B\u200C\u200D\uFEFF]/g, "").replace(/\u3000/g, " ");
  if (withoutZw !== withBreaks) {
    actions.push({ type: "normalize-spaces", description: "规范化空白字符" });
  }
  const hadCodeBlock = options.protectCodeBlocks && /```[\s\S]*?```/.test(withoutZw);
  const protectedValue = options.protectCodeBlocks ? protectCodeBlocks(withoutZw) : { text: withoutZw, restore: (value: string) => value };
  if (hadCodeBlock) {
    actions.push({ type: "protect-code-block", description: "保护代码块" });
  }
  let cleaned = protectedValue.text;
  if (!options.preserveOriginalLineBreaks) {
    const joined = joinWrappedLines(protectedValue.text.split("\n")).join("\n").replace(/\n{3,}/g, "\n\n");
    if (joined !== protectedValue.text) {
      actions.push({ type: "remove-soft-wraps", description: "已自动整理网页换行" });
    }
    cleaned = joined;
  }
  const normalizedText = protectedValue.restore(cleaned).trim() || text;
  return {
    originalText: text,
    normalizedText,
    cleanupActions: normalizedText === text ? [] : actions
  };
}
