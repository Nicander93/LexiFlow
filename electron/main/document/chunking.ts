export type DocumentFormat = "txt" | "markdown" | "srt" | "pdf" | "code";

export interface DocumentChunk {
  id: string;
  source: string;
  translatable: boolean;
  prefix?: string;
  suffix?: string;
}

function splitPlainText(text: string, maxLength: number): DocumentChunk[] {
  const paragraphs = text.split(/(\n{2,})/);
  const chunks: DocumentChunk[] = [];
  let buffer = "";
  const flush = () => { if (buffer) { chunks.push({ id: `chunk-${chunks.length + 1}`, source: buffer, translatable: true }); buffer = ""; } };
  for (const part of paragraphs) {
    if (!part) continue;
    if (buffer && buffer.length + part.length > maxLength) flush();
    if (part.length > maxLength) {
      const sentences = part.match(/[^.!?。！？]+[.!?。！？]?\s*/g) ?? [part];
      for (const sentence of sentences) { if (buffer && buffer.length + sentence.length > maxLength) flush(); buffer += sentence; }
    } else buffer += part;
  }
  flush();
  return chunks;
}

function chunkCodePreview(text: string): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  const lines = text.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g)?.filter(Boolean) ?? [];
  for (const line of lines) {
    const match = line.match(/^(\s*(?:\/\/|#|;|\*+)\s*)(.*?)(\r?\n?)$/);
    if (match && match[2].trim()) chunks.push({ id: `chunk-${chunks.length + 1}`, source: match[2], prefix: match[1], suffix: match[3], translatable: true });
    else chunks.push({ id: `chunk-${chunks.length + 1}`, source: line, translatable: false });
  }
  return chunks;
}

export function chunkDocument(text: string, format: DocumentFormat, maxLength = 1800): DocumentChunk[] {
  if (format === "code") return chunkCodePreview(text);
  if (format === "srt") {
    return text.replace(/\r\n?/g, "\n").trim().split(/\n{2,}/).flatMap<DocumentChunk>((block, index) => {
      const lines = block.split("\n");
      if (lines.length < 3 || !/-->/.test(lines[1] ?? "")) return [{ id: `chunk-${index + 1}`, source: block, translatable: false }];
      return [{ id: `chunk-${index + 1}`, source: lines.slice(2).join("\n"), prefix: `${lines.slice(0, 2).join("\n")}\n`, suffix: "", translatable: true }];
    });
  }
  if (format === "markdown") {
    const chunks: DocumentChunk[] = [];
    const parts = text.split(/(```[\s\S]*?```)/g);
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith("```")) chunks.push({ id: `chunk-${chunks.length + 1}`, source: part, translatable: false });
      else for (const chunk of splitPlainText(part, maxLength)) chunks.push({ ...chunk, id: `chunk-${chunks.length + 1}` });
    }
    return chunks;
  }
  return splitPlainText(text, maxLength);
}

export function assembleDocument(chunks: DocumentChunk[], translations: Record<string, string>): string {
  return chunks.map((chunk) => chunk.translatable ? `${chunk.prefix ?? ""}${translations[chunk.id] ?? chunk.source}${chunk.suffix ?? ""}` : chunk.source).join("");
}
