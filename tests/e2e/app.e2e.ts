import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import type { TranslatorApi } from "../../electron/shared/api";

let electronApp: ElectronApplication;
let mainWindow: Page;
const require = createRequire(import.meta.url);
const packagedExecutable = process.env.LEXIFLOW_EXECUTABLE;
const electronExecutable = packagedExecutable || require("electron") as string;

/** Windows CI/desktop GPU stacks often crash Chromium; keep LEXIFLOW_E2E sandbox/HWACCEL off and force software path. */
const E2E_GPU_ARGS = ["--disable-gpu", "--disable-software-rasterizer", "--in-process-gpu"];

async function describeLaunchFailure(app: ElectronApplication): Promise<string> {
  const windows = app.windows().map((page) => ({ url: page.url() }));
  let stderr = "";
  try {
    // best-effort: process may already be gone
    const child = app.process();
    stderr = (child.stderr?.read()?.toString() ?? "").slice(-4_000);
  } catch {
    stderr = "";
  }
  return [
    `windows=${JSON.stringify(windows)}`,
    stderr ? `stderr_tail=${stderr}` : "stderr_tail=<empty>"
  ].join("\n");
}

test.beforeAll(async () => {
  const args = packagedExecutable ? [...E2E_GPU_ARGS] : [resolve("."), ...E2E_GPU_ARGS];
  electronApp = await electron.launch({
    executablePath: electronExecutable,
    args,
    env: { ...process.env, LEXIFLOW_E2E: "1" }
  });

  electronApp.on("window", (page) => {
    page.on("pageerror", (error) => console.error("[e2e renderer]", error.message));
    page.on("console", (message) => {
      if (message.type() === "error") console.error("[e2e console]", message.text());
    });
  });

  try {
    await expect
      .poll(() => electronApp.windows().some((page) => page.url() && !page.url().includes("/popup")), {
        timeout: 45_000,
        message: "waiting for LexiFlow main window"
      })
      .toBe(true);
  } catch (error) {
    const detail = await describeLaunchFailure(electronApp);
    throw new Error(`LexiFlow main window was not created.\n${detail}\nCause: ${error instanceof Error ? error.message : error}`);
  }

  const window = electronApp.windows().find((page) => page.url() && !page.url().includes("/popup"));
  if (!window) {
    const detail = await describeLaunchFailure(electronApp);
    throw new Error(`LexiFlow main window was not created.\n${detail}`);
  }
  mainWindow = window;
  mainWindow.on("pageerror", (error) => console.error("[e2e main pageerror]", error.message));
  await mainWindow.waitForLoadState("domcontentloaded");
  console.info("[e2e] main window url=", mainWindow.url());
});

test.afterAll(async () => {
  await electronApp?.close();
});

test("preload contract and primary routes render", async () => {
  const runtime = await mainWindow.evaluate(() =>
    (window as Window & { translator?: TranslatorApi }).translator?.runtime.ping()
  );
  expect(runtime).toMatchObject({ apiVersion: 1, platform: "win32" });
  await expect(mainWindow.getByRole("heading", { name: "翻译" })).toBeVisible();

  await mainWindow.getByRole("link", { name: /设置/ }).click();
  await expect(mainWindow.getByRole("heading", { name: "设置" })).toBeVisible();
  await expect(mainWindow.getByText("模型服务", { exact: true })).toBeVisible();
});

test("translation validation reaches the renderer through IPC", async () => {
  await mainWindow.getByRole("link", { name: /翻译/ }).click();
  await mainWindow.getByRole("button", { name: "开始翻译" }).click();
  await expect(mainWindow.getByText(/请输入文本/)).toBeVisible();
});

test("configured Ollama model completes a real translation", async () => {
  const model = process.env.LEXIFLOW_E2E_MODEL;
  test.skip(!model, "Set LEXIFLOW_E2E_MODEL to run the local-model integration test.");
  test.setTimeout(120_000);

  await mainWindow.getByRole("link", { name: /设置/ }).click();
  const modelInput = mainWindow.getByLabel("模型名称");
  await modelInput.fill(model!);
  await expect(modelInput).toHaveValue(model!);
  await mainWindow.getByRole("button", { name: "保存设置" }).click();
  const saveMessage = mainWindow.locator(".toast");
  await expect(saveMessage).toBeVisible();
  await expect.poll(() => mainWindow.evaluate(() =>
    (window as Window & { translator?: TranslatorApi }).translator?.settings.get()
  ).then((settings) => settings?.provider.model)).toBe(model);

  await mainWindow.getByRole("link", { name: /翻译/ }).click();
  await mainWindow.getByPlaceholder("输入或粘贴文本，Ctrl + Enter 执行").fill("Hello, world.");
  await mainWindow.getByRole("button", { name: "开始翻译" }).click();
  await expect(mainWindow.locator(".result-text")).toBeVisible({ timeout: 100_000 });
  await expect(mainWindow.locator(".result-text")).not.toHaveText("");
});
