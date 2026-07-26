import type { NamingResult } from "../../shared/types";
import { validateNamingResponse } from "./structured";

/** Maps structured validation failures to user-facing Chinese errors. 把校验失败映射成可直接展示的中文错误。 */
export function parseNamingResult(content: string): NamingResult {
  const parsed = validateNamingResponse(content);
  if (!parsed.ok) {
    if (parsed.reason === "invalid-json") throw new Error("模型返回的命名结果格式不正确，请重试。");
    if (parsed.reason === "empty") throw new Error("模型没有返回可用的候选名称。");
    throw new Error("模型返回的命名结果缺少必要字段。");
  }
  return parsed.result;
}
