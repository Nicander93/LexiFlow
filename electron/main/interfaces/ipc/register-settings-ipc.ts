import type { SettingsPatch } from "../../../shared/types";
import { parseSettingsPatch } from "../../ipc/validation";
import { IPC_CHANNELS } from "../../../shared/types";
import { registerInvoke } from "./helpers";
import type { IpcDependencies } from "./types";

export function registerSettingsIpc(dependencies: IpcDependencies): void {
  const { settingsUseCases } = dependencies;
  registerInvoke(IPC_CHANNELS.settingsGet, () => settingsUseCases.get());
  registerInvoke(IPC_CHANNELS.settingsGetSnapshot, () => settingsUseCases.getSnapshot());
  registerInvoke(IPC_CHANNELS.settingsPatch, (_event, value: SettingsPatch) => settingsUseCases.patch(parseSettingsPatch(value)));
}
