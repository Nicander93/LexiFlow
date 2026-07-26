export interface TextCleanupOptions {
  preserveOriginalLineBreaks: boolean;
  protectCodeBlocks: boolean;
}

const MARKDOWN_STRUCTURE = /^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s)/;

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

/** Normalizes copied text while keeping paragraphs, Markdown structure and fenced code intact. */
export function cleanInputText(text: string, options: TextCleanupOptions): string {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/[\u200B\u200C\u200D\uFEFF]/g, "").replace(/\u3000/g, " ");
  const protectedValue = options.protectCodeBlocks ? protectCodeBlocks(normalized) : { text: normalized, restore: (value: string) => value };
  const cleaned = options.preserveOriginalLineBreaks
    ? protectedValue.text
    : joinWrappedLines(protectedValue.text.split("\n")).join("\n").replace(/\n{3,}/g, "\n\n");
  return protectedValue.restore(cleaned).trim();
}
