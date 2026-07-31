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

function navLink(page: Page, hash: string) {
  return page.locator(`a[href="${hash}"]`);
}

async function describeLaunchFailure(app: ElectronApplication): Promise<string> {
  const windows = app.windows().map((page) => ({ url: page.url() }));
  let stderr = "";
  try {
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
      .poll(async () => {
        for (const page of electronApp.windows()) {
          if (!page.url() || /popup/i.test(page.url())) continue;
          if (await navLink(page, "#/settings").count()) return true;
        }
        return false;
      }, {
        timeout: 45_000,
        message: "waiting for LexiFlow main window"
      })
      .toBe(true);
  } catch (error) {
    const detail = await describeLaunchFailure(electronApp);
    throw new Error(`LexiFlow main window was not created.\n${detail}\nCause: ${error instanceof Error ? error.message : error}`);
  }

  let selected: Page | undefined;
  for (const page of electronApp.windows()) {
    if (!page.url() || /popup/i.test(page.url())) continue;
    if (await navLink(page, "#/settings").count()) {
      selected = page;
      break;
    }
  }
  if (!selected) {
    const detail = await describeLaunchFailure(electronApp);
    throw new Error(`LexiFlow main window was not created.\n${detail}`);
  }
  mainWindow = selected;
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
  expect(runtime).toMatchObject({ apiVersion: 2, platform: "win32" });
  await expect(mainWindow.getByRole("heading", { name: "翻译" })).toBeVisible();

  await navLink(mainWindow, "#/settings").click();
  await expect(mainWindow.getByRole("heading", { name: "常规" })).toBeVisible();
  await expect(mainWindow.getByRole("button", { name: "模型服务" })).toBeVisible();
});

test("compact window, settings navigation, and shortcut recording", async ({}, testInfo) => {
  const browserWindow = await electronApp.browserWindow(mainWindow);
  const bounds = await browserWindow.evaluate((window) => window.getContentBounds());
  // Native Windows frame/DPI reduces content bounds slightly; manager options remain 960x680.
  expect(bounds.width).toBeGreaterThanOrEqual(940);
  expect(bounds.width).toBeLessThanOrEqual(960);
  expect(bounds.height).toBeGreaterThanOrEqual(600);
  expect(bounds.height).toBeLessThanOrEqual(680);
  await navLink(mainWindow, "#/settings").click();
  for (const category of ["常规", "划词与快捷键", "翻译", "模型服务", "词典与术语", "高级"]) {
    await mainWindow.getByRole("button", { name: category, exact: true }).click();
    await expect(mainWindow.getByRole("heading", { name: category, exact: true, level: 1 })).toBeVisible();
  }

  await mainWindow.getByRole("button", { name: "划词与快捷键", exact: true }).click();
  const recorder = mainWindow.getByRole("button", { name: "录制快速翻译快捷键" });
  await recorder.click();
  await expect(recorder).toContainText("请按下快捷键");
  await mainWindow.keyboard.press("Escape");
  await expect(recorder).not.toContainText("请按下快捷键");
  await mainWindow.getByRole("button", { name: "常规", exact: true }).click();
  await expect(mainWindow.getByLabel("界面字体大小")).toHaveValue("14");

  await mainWindow.screenshot({ path: testInfo.outputPath("compact-settings.png"), fullPage: true });
});

test("local dictionary lookup shows card without requiring a model", async () => {
  await navLink(mainWindow, "#/").click();
  const source = mainWindow.locator("textarea").first();
  await source.fill("sorry");
  await expect(mainWindow.getByRole("heading", { name: "sorry" })).toBeVisible({ timeout: 10_000 });
  await expect(mainWindow.getByText(/难过|遗憾|抱歉|对不起/)).toBeVisible();
  await expect(mainWindow.getByRole("button", { name: "AI 翻译" }).first()).toBeVisible();
});

test("translation validation reaches the renderer through IPC", async () => {
  await navLink(mainWindow, "#/").click();
  await sourceClearAndValidate();
});

async function sourceClearAndValidate(): Promise<void> {
  const source = mainWindow.locator("textarea").first();
  await source.fill("");
  await mainWindow.getByRole("button", { name: "开始翻译", exact: true }).click();
  await expect(mainWindow.getByText(/请输入文本/)).toBeVisible();
}

test("configured Ollama model completes a real translation", async () => {
  const model = process.env.LEXIFLOW_E2E_MODEL;
  test.skip(!model, "Set LEXIFLOW_E2E_MODEL to run the local-model integration test.");
  test.setTimeout(120_000);

  await navLink(mainWindow, "#/settings").click();
  await mainWindow.getByRole("button", { name: "模型服务", exact: true }).click();
  const modelInput = mainWindow.getByLabel("模型名称");
  await modelInput.fill(model!);
  await expect(modelInput).toHaveValue(model!);
  await mainWindow.getByRole("button", { name: "保存", exact: true }).click();
  const saveMessage = mainWindow.locator(".toast");
  await expect(saveMessage).toBeVisible();
  await expect.poll(() => mainWindow.evaluate(() =>
    (window as Window & { translator?: TranslatorApi }).translator?.settings.get()
  ).then((settings) => settings?.provider.model)).toBe(model);

  await navLink(mainWindow, "#/").click();
  await mainWindow.getByPlaceholder("输入或粘贴文本，Ctrl + Enter 执行").fill("Hello, world.");
  await mainWindow.getByRole("button", { name: "开始翻译", exact: true }).click();
  await expect(mainWindow.locator(".result-text")).toBeVisible({ timeout: 100_000 });
  await expect(mainWindow.locator(".result-text")).not.toHaveText("");
});
