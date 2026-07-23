import { app } from "electron";
import { join } from "node:path";
import { bootstrapApplication } from "./bootstrap/application";

if (process.env.LEXIFLOW_E2E === "1") {
  app.setPath("userData", join(app.getPath("temp"), `lexiflow-e2e-${process.pid}`));
}

if (process.env.LEXIFLOW_E2E !== "1" && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void bootstrapApplication().catch((error: unknown) => {
    console.error("LexiFlow failed to start", error instanceof Error ? error.message : error);
    app.quit();
  });
}
