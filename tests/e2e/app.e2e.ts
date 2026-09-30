import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import type { TranslatorApi } from "../../electron/shared/api";
import { IPC_CHANNELS, type CaptureScreenResult, type PopupPayload } from "../../electron/shared/types";

let electronApp: ElectronApplication;
let mainWindow: Page;
let e2eUserDataDir: string;
const require = createRequire(import.meta.url);
const packagedExecutable = process.env.LEXIFLOW_EXECUTABLE;
const electronExecutable = packagedExecutable || require("electron") as string;
const uiVerificationDir = resolve("artifacts", "ui-verification");

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
  await mkdir(uiVerificationDir, { recursive: true });
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
      kind: "translation",
      origin: "main",
      usageCount: 2,
      revisions: [],
      segments: [{ id: "e2e-segment", source: "history source", target: "history result", sourceStart: 0, sourceEnd: 14 }]
    }, {
      id: "e2e-chinese-history", sourceText: "Chinese selection fixture.", resultText: "中文译文立即提升。",
      mode: "normal", profileId: "general", sourceLanguage: "en", targetLanguage: "zh-CN", provider: "ollama", model: "e2e-fixture",
      createdAt: "2026-08-08T00:00:00.000Z", isFavorite: false, revisions: [],
      segments: [{ id: "e2e-chinese-segment", source: "Chinese selection fixture.", target: "中文译文立即提升。", sourceStart: 0, sourceEnd: 26 }]
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
  // The user's running LexiFlow owns its real shortcuts. Find independent test
  // bindings through the same Windows API without disturbing that process.
  const shortcuts = await electronApp.evaluate(({ globalShortcut }) => {
    const available: string[] = [];
    for (let key = 13; key <= 24 && available.length < 3; key += 1) {
      const shortcut = `Ctrl+Alt+Shift+F${key}`;
      if (!globalShortcut.register(shortcut, () => undefined)) continue;
      globalShortcut.unregister(shortcut);
      available.push(shortcut);
    }
    if (available.length < 3) throw new Error("Not enough free native shortcuts for the isolated E2E process.");
    return { translation: available[0]!, naming: available[1]!, screenshot: available[2]! };
  });
  await mainWindow.evaluate(async (configured) => {
    const api = (window as Window & { translator?: TranslatorApi }).translator!;
    await api.settings.patch({ type: "update-shortcuts", value: configured });
  }, shortcuts);
  console.info("[e2e] main window url=", mainWindow.url());
});

test.afterAll(async () => {
  if (electronApp) {
    // app.quit() is intentionally intercepted by the tray lifecycle. Kill only
    // this Playwright-owned child after assertions so native shortcuts cannot
    // hold the worker open.
    const child = electronApp.process();
    if (!child.killed) child.kill("SIGKILL");
  }
  if (e2eUserDataDir) void rm(e2eUserDataDir, { recursive: true, force: true }).catch(() => undefined);
});

test("preload contract and primary routes render", async () => {
  const runtime = await mainWindow.evaluate(() =>
    (window as Window & { translator?: TranslatorApi }).translator?.runtime.ping()
  );
  expect(runtime).toMatchObject({ apiVersion: 2, platform: "win32" });
  await expect(mainWindow.getByRole("heading", { name: "翻译" })).toBeVisible();
  await expect(mainWindow.getByPlaceholder("输入或粘贴文本")).toBeVisible();
  await expect(mainWindow.getByRole("button", { name: "更多" })).toHaveCount(0);
  expect(await mainWindow.getByPlaceholder("输入或粘贴文本").evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("none");
  await saveUiScreenshot(mainWindow, "workbench-empty.png");

  await mainWindow.getByRole("button", { name: /翻译|代码命名/ }).first().click();
  await mainWindow.getByRole("option", { name: "代码命名" }).click();
  await expect(mainWindow.getByLabel("类型")).toBeVisible();
  await expect(mainWindow.getByLabel("风格")).toBeVisible();
  await saveUiScreenshot(mainWindow, "naming.png");

  await mainWindow.keyboard.press("Escape");
  await navLink(mainWindow, "#/settings").click();
  await expect.poll(() => new URL(mainWindow.url()).hash).toBe("#/settings");
  await expect(mainWindow.getByRole("button", { name: "返回翻译" })).toBeVisible();
  await expect(mainWindow.getByRole("heading", { name: "常规" })).toBeVisible();
  await expect(mainWindow.getByRole("button", { name: "模型服务" })).toBeVisible();
});

test("compact window, settings navigation, and shortcut recording", async () => {
  if (await mainWindow.getByRole("button", { name: "返回翻译" }).count()) {
    await mainWindow.getByRole("button", { name: "返回翻译" }).click();
  } else {
    await mainWindow.evaluate(() => { location.hash = "#/"; });
  }
  await expect(mainWindow.getByPlaceholder("输入或粘贴文本")).toBeVisible();
  const browserWindow = await electronApp.browserWindow(mainWindow);
  const bounds = await browserWindow.evaluate((window) => window.getContentBounds());
  // Native Windows frame/DPI reduces content bounds slightly; VNext targets 760x540.
  expect(bounds.width).toBeGreaterThanOrEqual(740);
  expect(bounds.width).toBeLessThanOrEqual(780);
  expect(bounds.height).toBeGreaterThanOrEqual(500);
  expect(bounds.height).toBeLessThanOrEqual(560);
  await navLink(mainWindow, "#/settings").click();
  await expect(mainWindow.getByRole("heading", { name: "常规", exact: true, level: 1 })).toBeVisible();
  await saveUiScreenshot(mainWindow, "settings.png", true);
  await expect(mainWindow.locator("select")).toHaveCount(0);
  const closeAction = mainWindow.getByRole("combobox", { name: "关闭主窗口时" });
  await closeAction.click();
  await expect(mainWindow.getByRole("listbox", { name: "关闭主窗口时" })).toBeVisible();
  await expect(mainWindow.getByRole("option", { name: "隐藏到托盘" })).toHaveAttribute("aria-selected", "true");
  await mainWindow.waitForTimeout(180);
  await saveUiScreenshot(mainWindow, "settings-select-open.png", true);
  await mainWindow.keyboard.press("Escape");
  for (const category of ["常规", "划词与快捷键", "翻译", "模型服务", "高级"]) {
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
  await mainWindow.getByRole("button", { name: "返回翻译" }).click();
  await expect(mainWindow.getByPlaceholder("输入或粘贴文本")).toBeVisible();
});

test("local dictionary lookup shows card without requiring a model", async () => {
  await mainWindow.evaluate(() => { location.hash = "#/"; });
  await expect(mainWindow.getByPlaceholder("输入或粘贴文本")).toBeVisible();
  const source = mainWindow.locator("textarea").first();
  await source.fill("sorry");
  await expect(mainWindow.getByRole("heading", { name: "sorry" })).toBeVisible({ timeout: 10_000 });
  await expect(mainWindow.getByText(/难过|遗憾|抱歉|对不起/)).toBeVisible();
  await expect(mainWindow.getByPlaceholder("输入或粘贴文本")).toBeVisible();
  await saveUiScreenshot(mainWindow, "dictionary.png");
});

test("internal selections translate independently in both directions", async () => {
  await electronApp.evaluate(({ ipcMain }, channels) => {
    ipcMain.removeHandler(channels.selectionTranslationStart);
    ipcMain.handle(channels.selectionTranslationStart, (event, request) => {
      const text = request.text as string;
      (globalThis as typeof globalThis & { __selectionText?: string }).__selectionText = text;
      const id = `selection-${Date.now()}`;
      setTimeout(() => event.sender.send(channels.selectionTranslationEvent, { requestId: id, status: "success", content: /[\u3400-\u9fff]/.test(text) ? "Selected Chinese translation." : "选中的英文译文。" }), 150);
      return id;
    });
  }, IPC_CHANNELS);
  await mainWindow.getByRole("button", { name: "历史记录" }).click();
  await mainWindow.locator(".drawer-item").filter({ hasText: "Chinese selection fixture." }).click();
  const target = mainWindow.locator(".simple-target .translation-segment");
  const before = await mainWindow.evaluate(async () => {
    const api = (window as Window & { translator?: TranslatorApi }).translator!;
    return { session: await api.translation.getSession(), history: await api.history.list() };
  });
  await target.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await expect(mainWindow.getByRole("button", { name: "查词", exact: true })).toHaveCount(0);
  await mainWindow.getByRole("button", { name: "翻译选中内容", exact: true }).click();
  const panel = mainWindow.getByRole("region", { name: "选中内容翻译", exact: true });
  await expect(panel).toContainText("中文 → 英文");
  await expect(panel).toContainText("Selected Chinese translation.");
  await expect(target).toHaveText("中文译文立即提升。");
  await panel.getByRole("button", { name: "复制选区译文" }).click();
  expect(await electronApp.evaluate(({ clipboard }) => clipboard.readText())).toBe("Selected Chinese translation.");
  await mainWindow.getByRole("button", { name: "关闭选区翻译" }).click();

  const source = mainWindow.getByPlaceholder("输入或粘贴文本");
  await source.evaluate((element) => {
    const input = element as HTMLTextAreaElement;
    input.focus();
    input.setSelectionRange(0, 7);
    input.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await expect(mainWindow.getByRole("button", { name: "查词", exact: true })).toBeVisible();
  await mainWindow.getByRole("button", { name: "翻译选中内容", exact: true }).click();
  await expect(panel).toContainText("英文 → 中文");
  await expect(panel).toContainText("选中的英文译文。");
  expect(await electronApp.evaluate(() => (globalThis as typeof globalThis & { __selectionText?: string }).__selectionText)).toBe("Chinese");
  await expect(source).toHaveValue("Chinese selection fixture.");
  const after = await mainWindow.evaluate(async () => {
    const api = (window as Window & { translator?: TranslatorApi }).translator!;
    return { session: await api.translation.getSession(), history: await api.history.list() };
  });
  expect(after).toEqual(before);
  await saveUiScreenshot(mainWindow, "internal-selection-translation.png", true);
  await mainWindow.getByRole("button", { name: "关闭选区翻译" }).click();
});

test("text selection and segment revision use one contextual panel", async () => {
  await mainWindow.evaluate(() => { location.hash = "#/"; });
  await mainWindow.getByRole("button", { name: "历史记录" }).click();
  await mainWindow.locator(".drawer-item").filter({ hasText: "history source" }).click();

  const segment = mainWindow.locator(".simple-target .translation-segment");
  await expect(segment).toBeVisible();
  await segment.click();
  await expect(mainWindow.getByText("调整这句话", { exact: true })).toHaveCount(0);
  await mainWindow.getByRole("button", { name: "调整第 1 句" }).click();
  await expect(mainWindow.getByText("调整这句话", { exact: true })).toBeVisible();

  await segment.evaluate((element) => {
    const text = element.firstChild;
    if (!text) throw new Error("Expected segment text node.");
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, "history".length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  await expect(mainWindow.getByRole("button", { name: "查词", exact: true })).toBeVisible();
  await expect(mainWindow.getByText("词典", { exact: true })).toHaveCount(0);
  await mainWindow.getByRole("button", { name: "查词", exact: true }).click();
  await expect(mainWindow.getByText("词典", { exact: true })).toBeVisible();
  await expect(mainWindow.getByText("调整这句话", { exact: true })).toHaveCount(0);
  await saveUiScreenshot(mainWindow, "translation-context-dictionary.png");

  await mainWindow.keyboard.press("Escape");
  await expect(mainWindow.getByText("词典", { exact: true })).toHaveCount(0);
  await mainWindow.getByRole("button", { name: "调整第 1 句" }).click();
  await expect(mainWindow.getByText("调整这句话", { exact: true })).toBeVisible();
});

test("Chinese selection stays native and drafts preserve the previous translation", async () => {
  await mainWindow.getByRole("button", { name: "关闭局部重译" }).click();
  await mainWindow.getByRole("button", { name: "历史记录" }).click();
  await mainWindow.locator(".drawer-item").filter({ hasText: "Chinese selection fixture." }).click();
  const target = mainWindow.locator(".simple-target .translation-segment");
  await expect(target).toHaveText("中文译文立即提升。");
  await target.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await expect(mainWindow.getByRole("button", { name: "查词", exact: true })).toHaveCount(0);
  await expect(mainWindow.getByText("词典", { exact: true })).toHaveCount(0);
  expect(await mainWindow.evaluate(() => window.getSelection()?.toString())).toBe("中文译文立即提升。");
  await mainWindow.getByRole("button", { name: "双语对照", exact: true }).click();
  await mainWindow.locator(".segment-text--source .translation-segment").evaluate((element) => {
    const text = element.firstChild;
    if (!text) throw new Error("Expected source text node.");
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, "Chinese".length);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await mainWindow.getByRole("button", { name: "查词", exact: true }).click();
  await expect(mainWindow.getByText("词典", { exact: true })).toBeVisible();
  await mainWindow.keyboard.press("Escape");
  await mainWindow.getByRole("button", { name: "仅译文", exact: true }).click();
  await mainWindow.getByPlaceholder("输入或粘贴文本").fill("Changed source draft.");
  await expect(mainWindow.getByText(/原文已修改，译文待更新/)).toBeVisible();
  await expect(target).toHaveText("中文译文立即提升。");
  await expect(mainWindow.getByRole("button", { name: "调整第 1 句" })).toHaveCount(0);
  await mainWindow.getByRole("button", { name: "双语对照", exact: true }).click();
  await expect(mainWindow.locator(".segment-text--source .translation-segment")).toHaveText("Chinese selection fixture.");
  await mainWindow.getByRole("button", { name: "仅译文", exact: true }).click();
  await mainWindow.getByRole("button", { name: "清空输入" }).click();
  await expect(mainWindow.locator(".translation-segment")).toHaveCount(0);
});

test("revision comparison requires confirmation and can undo, restore, or discard", async () => {
  await electronApp.evaluate(({ ipcMain }, channels) => {
    ipcMain.removeHandler(channels.revisionStart);
    let count = 0;
    ipcMain.handle(channels.revisionStart, (event, request) => {
      const requestId = `e2e-revision-${++count}`;
      setTimeout(() => event.sender.send(channels.revisionEvent, {
        requestId, status: "success", revision: {
          id: requestId, segmentId: request.segment.id, previousTarget: request.segment.target,
          newTarget: "新的建议译文。", instruction: request.instruction, createdAt: Date.now()
        }
      }), 150);
      return requestId;
    });
  }, { revisionStart: IPC_CHANNELS.revisionStart, revisionEvent: IPC_CHANNELS.revisionEvent });

  await mainWindow.getByRole("button", { name: "历史记录" }).click();
  await mainWindow.locator(".drawer-item").filter({ hasText: "history source" }).click();
  const target = mainWindow.locator(".simple-target .translation-segment");
  await mainWindow.getByRole("button", { name: "调整第 1 句" }).click();
  await mainWindow.getByRole("button", { name: "更自然", exact: true }).click();
  await expect(mainWindow.locator(".revision-suggestion p")).toHaveText("新的建议译文。");
  await saveUiScreenshot(mainWindow, "workbench-revision-comparison.png", true);
  await expect(target).toHaveText("history result");
  const beforeApply = await mainWindow.evaluate(async () => (window as Window & { translator?: TranslatorApi }).translator!.history.get("e2e-history"));
  expect(beforeApply?.revisions).toHaveLength(0);
  await mainWindow.getByRole("button", { name: "复制译文", exact: true }).click();
  await expect.poll(() => electronApp.evaluate(({ clipboard }) => clipboard.readText())).toBe("history result");
  await mainWindow.getByRole("button", { name: "替换这句", exact: true }).click();
  await expect(target).toHaveText("新的建议译文。");
  await mainWindow.getByRole("button", { name: "历史记录" }).click();
  await mainWindow.locator(".drawer-item").filter({ hasText: "history source" }).click();
  await expect(target).toHaveText("新的建议译文。");
  await mainWindow.getByRole("button", { name: "调整第 1 句" }).click();
  await mainWindow.getByRole("button", { name: "撤销本句修改", exact: true }).click();
  await expect(target).toHaveText("history result");
  await mainWindow.getByRole("button", { name: "更自然", exact: true }).click();
  await mainWindow.getByRole("button", { name: "关闭局部重译" }).click();
  await mainWindow.waitForTimeout(250);
  await mainWindow.getByRole("button", { name: "调整第 1 句" }).click();
  await expect(mainWindow.locator(".revision-suggestion")).toHaveCount(0);
  await expect(target).toHaveText("history result");
  await mainWindow.getByRole("button", { name: "关闭局部重译" }).click();
  await saveUiScreenshot(mainWindow, "workbench-revision-confirmed.png");
});

test("dictionary words can be saved and managed in the vocabulary book", async () => {
  await mainWindow.evaluate(() => { location.hash = "#/"; });
  if (await mainWindow.getByRole("button", { name: "清空输入" }).count()) await mainWindow.getByRole("button", { name: "清空输入" }).click();
  const source = mainWindow.getByPlaceholder("输入或粘贴文本");
  await source.fill("sorry");
  await expect(mainWindow.getByRole("heading", { name: "sorry" })).toBeVisible({ timeout: 10_000 });
  await mainWindow.getByRole("button", { name: "加入生词本" }).click();
  await expect(mainWindow.getByText("已保存“sorry”。")).toBeVisible();
  await mainWindow.getByRole("link", { name: "打开单词本" }).click();
  await expect(mainWindow.getByRole("heading", { name: "单词本" })).toBeVisible();
  await expect(mainWindow.locator(".vocabulary-card strong").filter({ hasText: "sorry" })).toBeVisible();
  await expect(mainWindow.locator(".vocabulary-card button[aria-pressed]")).toBeVisible();
  await mainWindow.getByRole("button", { name: "标记已掌握" }).click();
  const entries = await mainWindow.evaluate(async () => {
    const api = (window as Window & { translator?: TranslatorApi }).translator!;
    return api.vocabulary.list();
  });
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({ term: "sorry", status: "mastered" });
  await saveUiScreenshot(mainWindow, "vocabulary.png", true);
});

test("selection tip icon fills its transparent 36px hit target without clipping", async () => {
  await mainWindow.evaluate(() => { location.hash = "#/selection-tip"; });
  const tip = mainWindow.getByRole("button", { name: "翻译选中文字" });
  await expect(tip).toBeVisible();
  const metrics = await tip.evaluate((button) => {
    const image = button.querySelector("img")!;
    const buttonStyle = getComputedStyle(button);
    const imageRect = image.getBoundingClientRect();
    return {
      bodyClass: document.body.classList.contains("selection-tip-body"),
      buttonWidth: button.getBoundingClientRect().width,
      buttonHeight: button.getBoundingClientRect().height,
      imageWidth: imageRect.width,
      imageHeight: imageRect.height,
      outerWidth: button.getBoundingClientRect().width + Number.parseFloat(buttonStyle.marginLeft) + Number.parseFloat(buttonStyle.marginRight),
      outerHeight: button.getBoundingClientRect().height + Number.parseFloat(buttonStyle.marginTop) + Number.parseFloat(buttonStyle.marginBottom)
    };
  });
  expect(metrics.bodyClass).toBe(true);
  for (const key of ["buttonWidth", "buttonHeight", "imageWidth", "imageHeight"] as const) expect(metrics[key]).toBeCloseTo(32, 1);
  expect(metrics.outerWidth).toBeCloseTo(36, 1);
  expect(metrics.outerHeight).toBeCloseTo(36, 1);
  await tip.hover();
  const hoverBounds = await tip.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  });
  expect(hoverBounds.left).toBeGreaterThanOrEqual(0);
  expect(hoverBounds.top).toBeGreaterThanOrEqual(0);
  expect(hoverBounds.right).toBeLessThanOrEqual(36);
  expect(hoverBounds.bottom).toBeLessThanOrEqual(36);
  await mainWindow.screenshot({ path: resolve(uiVerificationDir, "selection-tip-fixed.png"), clip: { x: 0, y: 0, width: 36, height: 36 } });
  await mainWindow.evaluate(() => { location.hash = "#/"; });
  await expect(mainWindow.getByPlaceholder("输入或粘贴文本")).toBeVisible();
});

test("translation validation reaches the renderer through IPC", async () => {
  await mainWindow.evaluate(() => { location.hash = "#/"; });
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

test("popup selections use the internal toolbar and reset on a new payload", async () => {
  const popup = await popupPage();
  const sendPayload = () => electronApp.evaluate(({ BrowserWindow }, input) => {
    const window = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().includes("#/popup"));
    window?.webContents.send(input.channel, { text: "sorry", mode: "normal", profileId: "general" });
    window?.show();
  }, { channel: IPC_CHANNELS.popupPayload });
  await sendPayload();
  await expect(popup.locator(".dictionary-card-header strong")).toHaveText("sorry");
  const select = () => popup.locator(".popup-source-vnext p").evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await select();
  await expect(popup.getByRole("button", { name: "查词", exact: true })).toBeVisible();
  await popup.getByRole("button", { name: "翻译选中内容", exact: true }).click();
  await expect(popup.getByRole("region", { name: "选中内容翻译" })).toContainText("选中的英文译文。");
  await popup.keyboard.press("Escape");
  await expect(popup.getByRole("region", { name: "选中内容翻译" })).toHaveCount(0);
  await expect(popup.locator(".dictionary-card-header strong")).toHaveText("sorry");
  await select();
  await popup.getByRole("button", { name: "翻译选中内容", exact: true }).click();
  await sendPayload();
  await expect(popup.getByRole("region", { name: "选中内容翻译" })).toHaveCount(0);
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

test("invalid runtime shortcut registration rejects persistence and restores the previous group", async () => {
  await electronApp.evaluate(({ globalShortcut }) => {
    const state = globalThis as typeof globalThis & { __lexiflowOriginalRegister?: typeof globalShortcut.register; __lexiflowRegisterAttempts?: string[] };
    state.__lexiflowOriginalRegister = globalShortcut.register;
    state.__lexiflowRegisterAttempts = [];
    globalShortcut.register = ((accelerator, callback) => {
      state.__lexiflowRegisterAttempts?.push(accelerator);
      return accelerator !== "Ctrl+Alt+Y" && state.__lexiflowOriginalRegister!(accelerator, callback);
    }) as typeof globalShortcut.register;
  });
  let result: { error: string; previousShortcuts: { translation: string; naming: string; screenshot: string }; afterShortcuts: { translation: string; naming: string; screenshot: string } };
  let attempts: string[] = [];
  try {
    result = await mainWindow.evaluate(async () => {
      const api = (window as Window & { translator?: TranslatorApi }).translator!;
      const before = await api.settings.get();
      let error = "";
      try {
        await api.settings.patch({ type: "update-shortcuts", value: { naming: "Ctrl+Alt+Y" } });
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
      }
      const after = await api.settings.get();
      return {
        error,
        previousShortcuts: {
          translation: before.shortcuts.translation,
          naming: before.shortcuts.naming,
          screenshot: before.shortcuts.screenshot
        },
        afterShortcuts: {
          translation: after.shortcuts.translation,
          naming: after.shortcuts.naming,
          screenshot: after.shortcuts.screenshot
        }
      };
    });
    attempts = await electronApp.evaluate(() => {
      const state = globalThis as typeof globalThis & { __lexiflowRegisterAttempts?: string[] };
      return state.__lexiflowRegisterAttempts ?? [];
    });
  } finally {
    await electronApp.evaluate(({ globalShortcut }) => {
      const state = globalThis as typeof globalThis & { __lexiflowOriginalRegister?: typeof globalShortcut.register; __lexiflowRegisterAttempts?: string[] };
      if (state.__lexiflowOriginalRegister) globalShortcut.register = state.__lexiflowOriginalRegister;
      delete state.__lexiflowOriginalRegister;
      delete state.__lexiflowRegisterAttempts;
    });
    await mainWindow.evaluate(async () => {
      const api = (globalThis as unknown as Window & { translator?: TranslatorApi }).translator!;
    });
  }

  expect(result.error).toContain("注册失败");
  expect(result.afterShortcuts).toEqual(result.previousShortcuts);
  expect(attempts).toEqual(["Ctrl+Alt+Y", result.previousShortcuts.naming]);
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
    translation: Boolean(shortcuts.translation) && !shortcuts.paused,
    naming: Boolean(shortcuts.naming) && !shortcuts.paused,
    screenshot: Boolean(shortcuts.screenshot) && !shortcuts.paused
  });
});

test("native shortcut state remains independent from selection, pause and clear", async () => {
  const result = await mainWindow.evaluate(async () => {
    const api = (window as Window & { translator?: TranslatorApi }).translator!;
    const before = (await api.settings.get()).shortcuts;
    const statuses = [];
    try {
      await api.settings.patch({ type: "update-shortcuts", value: { enableSelectionTranslation: false } });
      statuses.push((await api.runtime.ping()).shortcutStatus);
      await api.settings.patch({ type: "update-shortcuts", value: { paused: true } });
      await api.settings.patch({ type: "update-shortcuts", value: { paused: false, translation: "" } });
      statuses.push((await api.runtime.ping()).shortcutStatus);
    } finally {
      await api.settings.patch({ type: "update-shortcuts", value: before });
    }
    return { statuses, before, restored: (await api.runtime.ping()).shortcutStatus };
  });
  expect(result.statuses.every((status) => status?.errors.length === 0)).toBe(true);
  expect(result.restored).toEqual({ translation: true, naming: true, screenshot: true, errors: [] });
  const native = await electronApp.evaluate(({ globalShortcut }, shortcuts) => [shortcuts.translation, shortcuts.naming, shortcuts.screenshot].every((shortcut) => globalShortcut.isRegistered(shortcut)), result.before);
  expect(native).toBe(true);
  await navLink(mainWindow, "#/settings").click();
  await mainWindow.getByRole("button", { name: "划词与快捷键", exact: true }).click();
  const status = mainWindow.getByRole("status", { name: "快捷键运行状态" });
  await expect(status).toContainText("快速翻译：已生效");
  await expect(status).toContainText("编程命名：已生效");
  await expect(status).toContainText("截图 OCR：已生效");
  await saveUiScreenshot(mainWindow, "shortcut-status-fixed.png", true);
  await mainWindow.getByRole("button", { name: "返回翻译" }).click();
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
    let captured: CaptureScreenResult;
    try {
      captured = await mainWindow.evaluate(async () => {
        const api = (globalThis as unknown as Window & { translator?: TranslatorApi }).translator!;
        return api.ocr.captureScreen();
      });
    } catch (error) {
      const hasDesktopFrame = captureDiagnostics.some((attempt) => attempt.sources?.some((source) => !source.empty) === true);
      if (!hasDesktopFrame) test.skip(true, "The current runner has no interactive desktop frame or screen handle.");
      throw error;
    }
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

test("history overlay restores a stored session without route change", async () => {
  await mainWindow.evaluate(() => { location.hash = "#/"; });
  await mainWindow.getByPlaceholder("输入或粘贴文本").fill("keep-me");
  const hashBefore = new URL(mainWindow.url()).hash;
  await mainWindow.getByRole("button", { name: "历史记录" }).click();
  await expect(mainWindow.getByRole("heading", { name: "历史" })).toBeVisible();
  await expect.poll(() => new URL(mainWindow.url()).hash).toBe(hashBefore);
  const item = mainWindow.getByText("history source", { exact: true });
  await expect(item).toBeVisible();
  await expect(mainWindow.locator(".drawer-item").filter({ hasText: "history source" }).getByText(/主窗口/)).toBeVisible();
  await item.click();
  await expect(mainWindow.getByRole("heading", { name: "历史" })).toHaveCount(0);
  await expect(mainWindow.getByPlaceholder("输入或粘贴文本")).toHaveValue("history source");
  const session = await mainWindow.evaluate(() =>
    (window as Window & { translator?: TranslatorApi }).translator?.translation.getSession()
  );
  expect(session?.historyId).toBe("e2e-history");
});

test("clearing local data removes history, documents, and vocabulary", async () => {
  const remaining = await mainWindow.evaluate(async () => {
    const api = (window as Window & { translator?: TranslatorApi }).translator!;
    await api.documents.start("e2e-document-task").catch(() => undefined);
    await api.privacy.clearLocalData();
    return { tasks: (await api.documents.list()).length, vocabulary: (await api.vocabulary.list()).length };
  });
  expect(remaining).toEqual({ tasks: 0, vocabulary: 0 });
  await mainWindow.evaluate(() => { location.hash = "#/"; });
  await mainWindow.getByRole("button", { name: "历史记录" }).click();
  await expect(mainWindow.getByText("完成一次翻译后，记录会留在这里")).toBeVisible();
});

async function popupPage(): Promise<Page> {
  await expect.poll(() => electronApp.windows().some((page) => page.url().includes("#/popup"))).toBe(true);
  const popup = electronApp.windows().find((page) => page.url().includes("#/popup"));
  if (!popup) throw new Error("Popup window was not created.");
  await popup.waitForLoadState("domcontentloaded");
  return popup;
}

async function saveUiScreenshot(page: Page, fileName: string, fullPage = false): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.screenshot({ path: resolve(uiVerificationDir, fileName), fullPage });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(160 * (attempt + 1));
    }
  }
  throw lastError;
}

async function sourceClearAndValidate(): Promise<void> {
  if (!(await mainWindow.locator("textarea").count())) {
    await mainWindow.evaluate(() => { location.hash = "#/"; });
  }
  const source = mainWindow.locator("textarea").first();
  await source.fill("");
  await expect(mainWindow.getByRole("button", { name: "开始翻译", exact: true })).toBeDisabled();
  const validationError = await mainWindow.evaluate(async () => {
    const api = (window as Window & { translator?: TranslatorApi }).translator!;
    try {
      await api.translation.start({ text: "", mode: "normal", targetLanguage: "zh-CN" });
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
  expect(validationError).toMatch(/请输入文本/);
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

  await mainWindow.getByRole("button", { name: "返回翻译" }).click();
  await mainWindow.getByPlaceholder("输入或粘贴文本").fill("Hello, world.");
  await mainWindow.getByRole("button", { name: "开始翻译", exact: true }).click();
  await expect(mainWindow.locator(".result-text, .simple-target")).toBeVisible({ timeout: 100_000 });
  await expect(mainWindow.locator(".result-text, .simple-target")).not.toHaveText("");
});
