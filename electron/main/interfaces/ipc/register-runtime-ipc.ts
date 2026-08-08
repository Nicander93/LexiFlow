import { IPC_CHANNELS } from "../../../shared/types";
import { registerInvoke, registerOn } from "./helpers";
import type { IpcDependencies } from "./types";

export function registerRuntimeIpc(dependencies: IpcDependencies): void {
  const { runtimeService } = dependencies;
  registerInvoke(IPC_CHANNELS.runtimePing, () => runtimeService.ping());
  registerInvoke(IPC_CHANNELS.providerHealth, () => runtimeService.providerHealth());
  registerInvoke(IPC_CHANNELS.providerModels, () => runtimeService.providerModels());
  registerInvoke(IPC_CHANNELS.selectionCapture, () => runtimeService.captureSelection());
  registerOn(IPC_CHANNELS.selectionTipTrigger, () => dependencies.triggerSelectionTip());
  registerOn(IPC_CHANNELS.selectionTipDismiss, () => dependencies.dismissSelectionTip());
  registerInvoke(IPC_CHANNELS.privacyClearLocalData, () => dependencies.clearLocalData());
  registerInvoke(IPC_CHANNELS.diagnosticsExport, () => runtimeService.exportDiagnostics());
}
