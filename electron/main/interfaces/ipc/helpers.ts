import { ipcMain } from "electron";
import { assertTrustedSender } from "../../ipc/security";

export function registerInvoke<Args extends unknown[], Result>(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: Args) => Result
): void {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedSender(event);
    return handler(event, ...(args as Args));
  });
}

export function registerOn<Args extends unknown[]>(
  channel: string,
  handler: (event: Electron.IpcMainEvent, ...args: Args) => void
): void {
  ipcMain.on(channel, (event, ...args) => {
    assertTrustedSender(event);
    handler(event, ...(args as Args));
  });
}
