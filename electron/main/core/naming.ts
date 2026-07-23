import type { NamingResult } from "../../shared/types";

export function parseNamingResult(content: string): NamingResult {
  const jsonText = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let value: unknown;
  try {
    value = JSON.parse(jsonText);
  } catch {
    throw new Error("模型返回的命名结果格式不正确，请重试。 ");
  }
  if (!value || typeof value !== "object") throw new Error("模型未返回有效的命名结果。 ");
  const result = value as Partial<NamingResult>;
  if (typeof result.recommended !== "string" || !Array.isArray(result.candidates)) {
    throw new Error("模型返回的命名结果缺少必要字段。 ");
  }
  const candidates = result.candidates.filter(
    (candidate) => candidate && typeof candidate.name === "string" && typeof candidate.meaning === "string"
  );
  if (!candidates.length) throw new Error("模型没有返回可用的候选名称。 ");
  return { recommended: result.recommended, candidates };
}
