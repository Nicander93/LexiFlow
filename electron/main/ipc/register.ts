import { registerAllIpc } from "../interfaces/ipc/register-all";
import type { IpcDependencies } from "../interfaces/ipc/types";

/** @deprecated Use interfaces/ipc/register-all.ts as the composition boundary. */
export function registerIpcHandlers(dependencies: IpcDependencies): void {
  registerAllIpc(dependencies);
}

export { registerAllIpc };
export type { IpcDependencies };
