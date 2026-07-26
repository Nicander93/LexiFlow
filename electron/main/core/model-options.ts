export interface ModelOptions {
  temperature: number;
  topP: number;
  maxTokens: number;
}

export function buildModelOptions(inputLength: number, temperature?: number): ModelOptions {
  return {
    temperature: typeof temperature === "number" && Number.isFinite(temperature) ? Math.min(2, Math.max(0, temperature)) : 0.1,
    topP: 0.8,
    maxTokens: Math.min(8192, Math.max(512, Math.ceil(inputLength * 1.6)))
  };
}
