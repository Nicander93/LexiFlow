import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import type { TranslatorApi } from "../../electron/shared/api";

let electronApp: ElectronApplication;
let mainWindow: Page;
const require = createRequire(import.meta.url);
const packagedExecutable = process.env.LEXIFLOW_EXECUTABLE;
const electronExecutable = packagedExecutable || require("electron") as string;

test.beforeAll(async () => {
  electronApp = await electron.launch({
    executablePath: electronExecutable,
    args: packagedExecutable ? [] : [resolve(".")],
    env: { ...process.env, LEXIFLOW_E2E: "1" }
  });

  await expect.poll(() => electronApp.windows().length).toBeGreaterThanOrEqual(2);
  const window = electronApp.windows().find((page) => !page.url().includes("/popup"));
  if (!window) throw new Error("LexiFlow main window was not created.");
  mainWindow = window;
  await mainWindow.waitForLoadState("domcontentloaded");
});

test.afterAll(async () => {
  await electronApp?.close();
});

test("preload contract and primary routes render", async () => {
  const runtime = await mainWindow.evaluate(() =>
    (window as Window & { translator?: TranslatorApi }).translator?.runtime.ping()
  );
  expect(runtime).toMatchObject({ apiVersion: 1, platform: "win32" });
  await expect(mainWindow.getByRole("heading", { name: "让文字自然地抵达另一种语言" })).toBeVisible();

  await mainWindow.getByRole("link", { name: /设置/ }).click();
  await expect(mainWindow.getByRole("heading", { name: "把 LexiFlow 调成顺手的样子" })).toBeVisible();
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
