export interface OllamaStreamItem {
  message?: { content?: string };
  done?: boolean;
  error?: string;
}

export interface OpenAIStreamItem {
  choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
  error?: { message?: string };
}

export function parseOllamaLine(line: string): { content: string; done: boolean } | null {
  if (!line.trim()) return null;
  const item = JSON.parse(line) as OllamaStreamItem;
  if (item.error) throw new Error(item.error);
  return { content: item.message?.content ?? "", done: Boolean(item.done) };
}

export function parseOpenAIEvent(event: string): { content: string; done: boolean } | null {
  const data = event
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data) return null;
  if (data.trim() === "[DONE]") return { content: "", done: true };
  const item = JSON.parse(data) as OpenAIStreamItem;
  if (item.error?.message) throw new Error(item.error.message);
  const choice = item.choices?.[0];
  return {
    content: choice?.delta?.content ?? "",
    done: Boolean(choice?.finish_reason)
  };
}

export async function* readDelimitedStream<T>(
  body: ReadableStream<Uint8Array>,
  delimiter: string,
  parse: (value: string) => T | null
): AsyncIterable<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const parts = buffer.split(delimiter);
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const parsed = parse(part);
        if (parsed !== null) yield parsed;
      }
      if (done) break;
    }
    if (buffer.trim()) {
      const parsed = parse(buffer);
      if (parsed !== null) yield parsed;
    }
  } finally {
    reader.releaseLock();
  }
}
