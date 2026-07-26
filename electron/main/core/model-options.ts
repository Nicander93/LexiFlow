export interface ModelOptions {
  temperature: number;
  topP: number;
  maxTokens: number;
}

/** Estimates maxTokens from input length (clamped 512–8192). maxTokens 按输入估算，避免短文本浪费、长文本截断。 */
export function buildModelOptions(inputLength: number, temperature?: number): ModelOptions {
  return {
    temperature: typeof temperature === "number" && Number.isFinite(temperature) ? Math.min(2, Math.max(0, temperature)) : 0.1,
    topP: 0.8,
    maxTokens: Math.min(8192, Math.max(512, Math.ceil(inputLength * 1.6)))
  };
}
