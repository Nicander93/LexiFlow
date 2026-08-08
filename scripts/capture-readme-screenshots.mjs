import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, "docs/screenshots");
const base = process.env.LEXIFLOW_PREVIEW_URL || "http://localhost:3301";

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });

async function shot(name) {
  await page.waitForTimeout(200);
  await page.screenshot({ path: resolve(outDir, `${name}.png`), type: "png" });
  console.log(`saved ${name}.png`);
}

await page.goto(`${base}/#/`, { waitUntil: "networkidle" });
await page.waitForSelector(".translation-page, .page");
await page.fill("textarea", "Keep the implementation small and observable.");
await page.getByRole("button", { name: "开始翻译" }).click();
await page.waitForTimeout(800);
await shot("translation");

await page.goto(`${base}/#/naming`, { waitUntil: "networkidle" });
await page.waitForSelector("textarea");
await page.fill("textarea", "是否已经完成水文数据同步");
await page.getByRole("button", { name: "生成名称" }).click();
await page.waitForSelector(".candidate-list, .recommended-card", { timeout: 5000 });
await page.waitForTimeout(300);
await shot("naming");

await page.goto(`${base}/#/history`, { waitUntil: "networkidle" });
await page.waitForSelector(".history-layout");
await page.waitForTimeout(400);
await shot("history");

await page.goto(`${base}/#/documents`, { waitUntil: "networkidle" });
await page.waitForSelector(".page");
await page.waitForTimeout(400);
await shot("documents");

await page.goto(`${base}/#/settings`, { waitUntil: "networkidle" });
await page.waitForSelector(".page");
await page.waitForTimeout(400);
await shot("settings");

await page.setViewportSize({ width: 420, height: 560 });
await page.goto(`${base}/#/popup`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.evaluate(() => {
  window.__lexiflowPreviewEmitPopup?.({
    text: "Keep the implementation small and observable.",
    mode: "technical"
  });
});
await page.waitForTimeout(900);
await shot("popup");

await browser.close();
