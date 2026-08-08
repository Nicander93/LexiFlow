import type { ProviderHealth, ProviderModel, RuntimeInfo, SelectionResult } from "../../../shared/types";

export interface RuntimePorts {
  runtimeInfo(): RuntimeInfo;
  providerHealth(): Promise<ProviderHealth>;
  providerModels(): Promise<ProviderModel[]>;
  captureSelection(): Promise<SelectionResult>;
  exportDiagnostics(): Promise<{ saved: boolean; path?: string }>;
}

/** Runtime application use cases. Platform/provider implementations are injected at bootstrap. */
export class RuntimeService {
  constructor(private readonly ports: RuntimePorts) {}

  ping(): RuntimeInfo { return this.ports.runtimeInfo(); }
  providerHealth(): Promise<ProviderHealth> { return this.ports.providerHealth(); }
  providerModels(): Promise<ProviderModel[]> { return this.ports.providerModels(); }
  captureSelection(): Promise<SelectionResult> { return this.ports.captureSelection(); }
  exportDiagnostics(): Promise<{ saved: boolean; path?: string }> { return this.ports.exportDiagnostics(); }
}
