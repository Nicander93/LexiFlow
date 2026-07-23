import { UserFacingError } from "../core/errors";

export function createRequestSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

export async function ensureResponse(response: Response): Promise<Response> {
  if (response.ok) return response;
  const text = await response.text();
  let detail = text;
  try {
    const json = JSON.parse(text) as { error?: string | { message?: string }; message?: string };
    detail = typeof json.error === "string" ? json.error : json.error?.message ?? json.message ?? text;
  } catch {
    // 保留服务返回的原始文本用于错误映射。
  }
  throw new UserFacingError(detail || `模型服务返回 HTTP ${response.status}。`);
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}
