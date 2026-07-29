import { shell, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

function trustedRendererOrigins(): string[] {
  const origins: string[] = [];
  const rendererUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    try {
      origins.push(new URL(rendererUrl).origin);
    } catch {
      origins.push(rendererUrl.replace(/\/$/, ""));
    }
  }
  try {
    origins.push(pathToFileURL(join(process.cwd(), "dist", "index.html")).href);
  } catch {
    // ignore
  }
  return origins;
}

function isTrustedUrl(url: string): boolean {
  if (!url || url === "about:blank") return false;
  if (url.startsWith("file:")) return url.includes("/dist/index.html") || url.includes("\\dist\\index.html") || url.endsWith("index.html");
  return trustedRendererOrigins().some((origin) => url === origin || url.startsWith(`${origin}/`) || url.startsWith(`${origin}#`));
}

/** 敏感 IPC 仅接受本应用主 Frame 的 Renderer。 */
export function assertTrustedSender(event: IpcMainInvokeEvent | Electron.IpcMainEvent): void {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) {
    throw new Error("拒绝非主 Frame 的 IPC 请求。");
  }
  const url = frame.url;
  if (!isTrustedUrl(url)) {
    throw new Error("拒绝来自未知页面的 IPC 请求。");
  }
}

function isAllowedExternal(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "mailto:";
  } catch {
    return false;
  }
}

/** 禁止任意外部导航；合法外链经 shell.openExternal 打开。 */
export function configureNavigationSecurity(window: BrowserWindow): void {
  window.webContents.on("will-navigate", (event, url) => {
    if (isTrustedUrl(url)) return;
    event.preventDefault();
    if (isAllowedExternal(url)) void shell.openExternal(url);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternal(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
}
