export class UserFacingError extends Error {}

export function mapProviderError(error: unknown): string {
  if (error instanceof UserFacingError) return error.message;
  if (error instanceof DOMException && error.name === "AbortError") return "请求已取消。";
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|timed out/i.test(message)) return "模型请求超时，请检查服务状态或增大超时时间。";
  if (/401|unauthorized|invalid.*key/i.test(message)) return "API Key 无效，请在设置中检查后重试。";
  if (/fetch failed|ECONNREFUSED|ENOTFOUND/i.test(message)) return "无法连接到模型服务，请确认服务已启动且地址正确。";
  if (/model.*not found|404/i.test(message)) return "未找到配置的模型，请在设置中选择或填写可用模型。";
  return "翻译请求失败，请检查模型服务设置后重试。";
}
