import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import type { TranslatorApi } from "../../electron/shared/api";
import { IPC_CHANNELS, type PopupPayload } from "../../electron/shared/types";

let electronApp: ElectronApplication;
let mainWindow: Page;
let e2eUserDataDir: string;
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
  e2eUserDataDir = await mkdtemp(resolve(tmpdir(), "lexiflow-e2e-"));
  await writeFile(resolve(e2eUserDataDir, "history.json"), JSON.stringify({
    schemaVersion: 2,
    items: [{
      id: "e2e-history",
      sourceText: "history source",
      originalSourceText: "history source",
      resultText: "history result",
      originalResultText: "history result",
      mode: "normal",
      profileId: "general",
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
      provider: "ollama",
      model: "e2e-fixture",
      createdAt: "2026-08-08T00:00:00.000Z",
      updatedAt: "2026-08-08T00:00:00.000Z",
      isFavorite: false,
      revisions: [],
      segments: [{ id: "e2e-segment", source: "history source", target: "history result", sourceStart: 0, sourceEnd: 14 }]
    }]
  }), "utf8");
  await writeFile(resolve(e2eUserDataDir, "document-tasks.json"), JSON.stringify({
    schemaVersion: 1,
    tasks: [{
      id: "e2e-document-task",
      fileName: "fixture.txt",
      format: "txt",
      totalChunks: 1,
      completedChunks: 0,
      status: "translating",
      profileId: "technical",
      model: "e2e-fixture",
      promptVersion: "v3.2",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sourcePath: resolve(e2eUserDataDir, "fixture.txt"),
      chunks: [{ id: "fixture-chunk", source: "fixture source", translatable: true }],
      translations: {}
    }]
  }), "utf8");
  const args = packagedExecutable ? [...E2E_GPU_ARGS] : [resolve("."), ...E2E_GPU_ARGS];
  electronApp = await electron.launch({
    executablePath: electronExecutable,
    args,
    env: { ...process.env, LEXIFLOW_E2E: "1", LEXIFLOW_E2E_USER_DATA: e2eUserDataDir }
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
  if (electronApp) {
    // app.quit() is intentionally intercepted by the tray lifecycle. Kill only
    // this Playwright-owned child after assertions so native shortcuts cannot
    // hold the worker open.
    const child = electronApp.process();
    if (!child.killed) child.kill();
  }
  if (e2eUserDataDir) void rm(e2eUserDataDir, { recursive: true, force: true }).catch(() => undefined);
});

test("preload contract and primary routes render", async () => {
  const runtime = await mainWindow.evaluate(() =>
    (window as Window & { translator?: TranslatorApi }).translator?.runtime.ping()
  );
  expect(runtime).toMatchObject({ apiVersion: 2, platform: "win32" });
  await expect(mainWindow.getByRole("heading", { name: "翻译" })).toBeVisible();

  await navLink(mainWindow, "#/settings").click();
  await expect(mainWindow.getByRole("heading", { name: "设置" })).toBeVisible();
  await expect(mainWindow.getByText("模型服务", { exact: true })).toBeVisible();
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

test("settings patches preserve independent concurrent sections", async () => {
  const result = await mainWindow.evaluate(async () => {
    const api = (window as Window & { translator?: TranslatorApi }).translator!;
    const before = await api.settings.get();
    const targetModel = `${before.provider.model}-e2e`;
    await Promise.all([
      api.settings.patch({ type: "update-provider", value: { model: targetModel } }),
      api.settings.patch({ type: "update-window", value: { popupBounds: { width: 720, height: 480 } } })
    ]);
    const middle = await api.settings.get();
    await Promise.all([
      api.settings.patch({ type: "update-provider", value: { model: before.provider.model } }),
      api.settings.patch({ type: "update-window", value: { popupBounds: before.window.popupBounds } })
    ]);
    return middle;
  });
  expect(result.provider.model).toMatch(/-e2e$/);
  expect(result.window.popupBounds).toEqual({ width: 720, height: 480 });
});

test("API keys stay masked and never enter settings JSON as plaintext", async () => {
  const provider = await mainWindow.evaluate(async () => {
    const api = (window as Window & { translator?: TranslatorApi }).translator!;
    const result = await api.settings.patch({ type: "update-provider", value: { apiKey: "e2e-secret-key" } });
    return result.snapshot.settings.provider;
  });
  expect(provider.apiKey).toBe("");
  expect(provider.apiKeyConfigured).toBe(true);
  const raw = await readFile(resolve(e2eUserDataDir, "settings.json"), "utf8");
  expect(raw).not.toContain("e2e-secret-key");
  const stored = JSON.parse(raw) as { provider?: { encryptedApiKey?: string } };
  const encryptionAvailable = await electronApp.evaluate(({ safeStorage }) => safeStorage.isEncryptionAvailable());
  if (encryptionAvailable) {
    expect(stored.provider?.encryptedApiKey).toEqual(expect.any(String));
    const decrypted = await electronApp.evaluate(({ safeStorage }, encoded) =>
      safeStorage.decryptString(Buffer.from(encoded, "base64")), stored.provider!.encryptedApiKey!);
    expect(decrypted).toBe("e2e-secret-key");
  } else {
    console.info("[safe-storage] encryption unavailable; volatile fallback only");
  }
  await mainWindow.evaluate(async () => {
    const api = (window as Window & { translator?: TranslatorApi }).translator!;
    await api.settings.patch({ type: "update-provider", value: { apiKey: "", apiKeyConfigured: false } });
  });
});

test("popup streaming layout does not persist automatic bounds", async () => {
  const popup = await popupPage();
  const settingsPath = resolve(e2eUserDataDir, "settings.json");
  const before = await readFile(settingsPath, "utf8");
  const payload: PopupPayload = { mode: "technical", profileId: "technical", capturing: true };

  await electronApp.evaluate(({ BrowserWindow }, input) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().includes("#/popup"));
    if (!window) throw new Error("Popup window was not created.");
    for (let index = 0; index < 100; index += 1) window.webContents.send(input.channel, input.payload);
  }, { channel: IPC_CHANNELS.popupPayload, payload });
  await popup.waitForTimeout(1_000);

  expect(await readFile(settingsPath, "utf8")).toBe(before);
});

test("invalid runtime shortcut registration restores the previous group", async () => {
  await electronApp.evaluate(({ globalShortcut }) => {
    const state = globalThis as typeof globalThis & { __lexiflowOriginalRegister?: typeof globalShortcut.register; __lexiflowRegisterAttempts?: string[] };
    state.__lexiflowOriginalRegister = globalShortcut.register;
    state.__lexiflowRegisterAttempts = [];
    globalShortcut.register = ((accelerator) => {
      state.__lexiflowRegisterAttempts?.push(accelerator);
      return accelerator !== "Ctrl+Alt+Y";
    }) as typeof globalShortcut.register;
  });
  let result: { shortcutResult: Awaited<ReturnType<TranslatorApi["settings"]["patch"]>>["shortcutResult"], previousShortcuts: { translation: string; naming: string; screenshot: string } };
  let attempts: string[] = [];
  try {
    result = await mainWindow.evaluate(async () => {
      const api = (window as Window & { translator?: TranslatorApi }).translator!;
      const before = await api.settings.get();
      const failed = await api.settings.patch({ type: "update-shortcuts", value: { naming: "Ctrl+Alt+Y" } });
      return {
        shortcutResult: failed.shortcutResult,
        previousShortcuts: {
          translation: before.shortcuts.translation,
          naming: before.shortcuts.naming,
          screenshot: before.shortcuts.screenshot
        }
      };
    });
    attempts = await electronApp.evaluate(() => {
      const state = globalThis as typeof globalThis & { __lexiflowRegisterAttempts?: string[] };
      return state.__lexiflowRegisterAttempts ?? [];
    });
    await mainWindow.evaluate(async (naming) => {
      const api = (globalThis as unknown as Window & { translator?: TranslatorApi }).translator!;
      await api.settings.patch({ type: "update-shortcuts", value: { naming } });
    }, result.previousShortcuts.naming);
  } finally {
    await electronApp.evaluate(({ globalShortcut }) => {
      const state = globalThis as typeof globalThis & { __lexiflowOriginalRegister?: typeof globalShortcut.register; __lexiflowRegisterAttempts?: string[] };
      if (state.__lexiflowOriginalRegister) globalShortcut.register = state.__lexiflowOriginalRegister;
      delete state.__lexiflowOriginalRegister;
      delete state.__lexiflowRegisterAttempts;
    });
    await mainWindow.evaluate(async () => {
      const api = (globalThis as unknown as Window & { translator?: TranslatorApi }).translator!;
      await api.settings.patch({ type: "update-shortcuts", value: { paused: true } });
      await api.settings.patch({ type: "update-shortcuts", value: { paused: false } });
    });
  }

  expect(result.shortcutResult.errors.length).toBeGreaterThan(0);
  expect(result.shortcutResult.translation).toBe(true);
  expect(result.shortcutResult.naming).toBe(false);
  expect(result.shortcutResult.screenshot).toBe(true);
  expect(attempts.slice(3, 6)).toEqual([
    result.previousShortcuts.translation,
    result.previousShortcuts.naming,
    result.previousShortcuts.screenshot
  ]);
});

test("running Windows process registers the configured global shortcuts", async () => {
  const shortcuts = await mainWindow.evaluate(async () => {
    const api = (window as Window & { translator?: TranslatorApi }).translator!;
    return (await api.settings.get()).shortcuts;
  });
  const registered = await electronApp.evaluate(({ globalShortcut }, configured) => ({
    translation: globalShortcut.isRegistered(configured.translation),
    naming: globalShortcut.isRegistered(configured.naming),
    screenshot: globalShortcut.isRegistered(configured.screenshot)
  }), shortcuts);

  expect(registered).toEqual({
    translation: shortcuts.enableSelectionTranslation && !shortcuts.paused,
    naming: !shortcuts.paused,
    screenshot: !shortcuts.paused
  });
});

test("native OCR smoke recognizes only the selected screen region", async () => {
  test.skip(process.env.LEXIFLOW_E2E_NATIVE_OCR !== "1", "Set LEXIFLOW_E2E_NATIVE_OCR=1 to run the desktop OCR smoke test.");
  test.setTimeout(45_000);

  await mainWindow.evaluate(() => {
    document.querySelector("#lexiflow-ocr-smoke")?.remove();
    const marker = document.createElement("div");
    marker.id = "lexiflow-ocr-smoke";
    marker.textContent = "LEXIFLOW OCR SMOKE";
    Object.assign(marker.style, {
      position: "fixed", left: "48px", top: "110px", width: "720px", height: "120px",
      zIndex: "2147483647", display: "grid", placeItems: "center", background: "white", color: "black",
      font: "bold 56px Arial", letterSpacing: "2px", border: "4px solid black"
    });
    document.body.appendChild(marker);
  });

  try {
    const rect = await mainWindow.locator("#lexiflow-ocr-smoke").boundingBox();
    if (!rect) throw new Error("OCR smoke marker is not visible.");
    const geometry = await electronApp.evaluate(({ BrowserWindow, screen }) => {
      const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.webContents.getURL().includes("#/popup"));
      if (!window) throw new Error("Main window was not found.");
      const contentBounds = window.getContentBounds();
      const display = screen.getDisplayNearestPoint({ x: contentBounds.x, y: contentBounds.y });
      return { contentBounds, displayBounds: display.bounds, scaleFactor: display.scaleFactor };
    });
    const captureDiagnostics = await electronApp.evaluate(async ({ desktopCapturer, screen }) => {
      const displays = screen.getAllDisplays();
      const width = Math.max(...displays.map((item) => Math.ceil(item.bounds.width * item.scaleFactor)), 1920);
      const height = Math.max(...displays.map((item) => Math.ceil(item.bounds.height * item.scaleFactor)), 1080);
      const sizes = [{ width: 1, height: 1 }, { width: 320, height: 180 }, { width: 1920, height: 1080 }, { width, height }];
      const attempts = [];
      for (const thumbnailSize of sizes) {
        try {
          const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize });
          attempts.push({ thumbnailSize, sources: sources.map((source) => ({ id: source.id, name: source.name, displayId: source.display_id, empty: source.thumbnail.isEmpty(), size: source.thumbnail.getSize() })) });
        } catch (error) {
          attempts.push({ thumbnailSize, error: error instanceof Error ? error.message : String(error) });
        }
      }
      return attempts;
    });
    console.info("[native-ocr] desktop sources=", JSON.stringify(captureDiagnostics));
    const captured = await mainWindow.evaluate(async () => {
      const api = (globalThis as unknown as Window & { translator?: TranslatorApi }).translator!;
      return api.ocr.captureScreen();
    });
    const x = Math.max(0, (geometry.contentBounds.x - geometry.displayBounds.x + rect.x - 20) * geometry.scaleFactor / captured.pixelWidth);
    const y = Math.max(0, (geometry.contentBounds.y - geometry.displayBounds.y + rect.y - 20) * geometry.scaleFactor / captured.pixelHeight);
    const right = Math.min(1, (geometry.contentBounds.x - geometry.displayBounds.x + rect.x + rect.width + 20) * geometry.scaleFactor / captured.pixelWidth);
    const bottom = Math.min(1, (geometry.contentBounds.y - geometry.displayBounds.y + rect.y + rect.height + 20) * geometry.scaleFactor / captured.pixelHeight);
    const result = await mainWindow.evaluate(async ({ captureId, region }) => {
      const api = (globalThis as unknown as Window & { translator?: TranslatorApi }).translator!;
      return api.ocr.recognizeRegion({ captureId, region });
    }, { captureId: captured.captureId, region: { x, y, width: right - x, height: bottom - y } });
    expect(`${result.text}\n${result.blocks.map((block) => block.text).join("\n")}`).toMatch(/OCR|LEXIFLOW/i);
  } finally {
    await mainWindow.evaluate(() => document.querySelector("#lexiflow-ocr-smoke")?.remove());
  }
});

test("history page opens a stored translation session through IPC", async () => {
  await navLink(mainWindow, "#/history").click();
  await expect(mainWindow.getByRole("heading", { name: "历史" })).toBeVisible();
  const item = mainWindow.getByRole("button", { name: /history source/ });
  await expect(item).toBeVisible();
  await item.click();
  await expect(mainWindow.getByText("history result", { exact: true })).toBeVisible();
  await mainWindow.getByRole("button", { name: "打开会话" }).click();
  await expect.poll(() => new URL(mainWindow.url()).hash).toBe("#/");
  await expect(mainWindow.locator("textarea").first()).toHaveValue("history source");
  const session = await mainWindow.evaluate(() =>
    (window as Window & { translator?: TranslatorApi }).translator?.translation.getSession()
  );
  expect(session?.historyId).toBe("e2e-history");
});

test("clearing local data removes the seeded history", async () => {
  const remainingTasks = await mainWindow.evaluate(async () => {
    const api = (window as Window & { translator?: TranslatorApi }).translator!;
    await api.documents.start("e2e-document-task").catch(() => undefined);
    await api.privacy.clearLocalData();
    return (await api.documents.list()).length;
  });
  expect(remainingTasks).toBe(0);
  await navLink(mainWindow, "#/history").click();
  await expect(mainWindow.getByText("还没有匹配的记录")).toBeVisible();
});

async function popupPage(): Promise<Page> {
  await expect.poll(() => electronApp.windows().some((page) => page.url().includes("#/popup"))).toBe(true);
  const popup = electronApp.windows().find((page) => page.url().includes("#/popup"));
  if (!popup) throw new Error("Popup window was not created.");
  await popup.waitForLoadState("domcontentloaded");
  return popup;
}

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
  const modelInput = mainWindow.getByLabel("模型名称");
  await modelInput.fill(model!);
  await expect(modelInput).toHaveValue(model!);
  await mainWindow.getByRole("button", { name: "保存设置" }).click();
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
