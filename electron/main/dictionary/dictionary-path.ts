import { app } from "electron";
import { join } from "node:path";

export function resolveDictionaryDatabasePath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "dictionaries", "ecdict-core.db");
  }
  return join(app.getAppPath(), "resources", "dictionaries", "ecdict-core.db");
}
