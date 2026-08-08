import { IPC_CHANNELS } from "../../../shared/types";
import { parseId, parseTranslationProfile } from "../../ipc/validation";
import { registerInvoke } from "./helpers";
import type { IpcDependencies } from "./types";

export function registerProfileIpc(dependencies: IpcDependencies): void {
  const { profileService } = dependencies;
  registerInvoke(IPC_CHANNELS.profileList, () => profileService.list());
  registerInvoke(IPC_CHANNELS.profileUpsert, (_event, profile: unknown) => profileService.upsert(parseTranslationProfile(profile)));
  registerInvoke(IPC_CHANNELS.profileDelete, (_event, id: string) => profileService.delete(parseId(id, "Profile ID")));
}
