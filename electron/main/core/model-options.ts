export interface ModelOptions {
  temperature: number;
  topP: number;
  maxTokens: number;
}

export function buildModelOptions(inputLength: number): ModelOptions {
  return {
    temperature: 0.1,
    topP: 0.8,
    maxTokens: Math.min(8192, Math.max(512, Math.ceil(inputLength * 1.6)))
  };
}
