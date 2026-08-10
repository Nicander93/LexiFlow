import { createCanvas } from "@napi-rs/canvas";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { WindowsOcrEngine } from "../electron/main/ocr/windows-ocr";

const nativeOcrTest = process.env.LEXIFLOW_E2E_NATIVE_OCR === "1" ? it : it.skip;

nativeOcrTest("Windows OCR engine recognizes text from a real image file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lexiflow-ocr-engine-"));
  const imagePath = join(directory, "ocr-smoke.png");
  try {
    const canvas = createCanvas(1_200, 240);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#111111";
    context.font = "bold 76px Arial";
    context.fillText("LEXIFLOW OCR SMOKE", 52, 150);
    await writeFile(imagePath, canvas.toBuffer("image/png"));

    const result = await new WindowsOcrEngine().recognize(imagePath, new AbortController().signal);

    expect(`${result.text}\n${result.blocks.map((block) => block.text).join("\n")}`).toMatch(/LEXIFLOW.*OCR.*SMOKE/is);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
