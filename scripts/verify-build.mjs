import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const files = {
  main: resolve(root, "dist-electron/main/index.js"),
  preload: resolve(root, "dist-electron/preload/index.cjs"),
  renderer: resolve(root, "dist/index.html")
};

await Promise.all(Object.values(files).map((file) => access(file)));
const [main, preload, renderer, packageJson] = await Promise.all([
  readFile(files.main, "utf8"),
  readFile(files.preload, "utf8"),
  readFile(files.renderer, "utf8"),
  readFile(resolve(root, "package.json"), "utf8").then(JSON.parse)
]);

const failures = [];
if (packageJson.main !== "dist-electron/main/index.js") failures.push("package.json main does not target the built main process");
if (!main.includes("../preload/index.cjs")) failures.push("main process does not reference the CommonJS preload");
if (/\b__dirname\b/.test(main)) failures.push("ESM main process still contains CommonJS __dirname");
if (!main.includes("../../build/icon.ico")) failures.push("main process does not load tray icon from build/icon.ico");
if (!packageJson.build?.files?.includes("build/icon.ico")) failures.push("electron-builder files does not include build/icon.ico");
if (!preload.includes('require("electron")')) failures.push("preload is not a CommonJS Electron bundle");
if (/^\s*import\s/m.test(preload)) failures.push("preload unexpectedly contains ESM imports");
if (!renderer.includes('src="./assets/') || !renderer.includes('href="./assets/')) failures.push("renderer assets are not relative for file:// loading");
await access(resolve(root, "build/icon.ico"));

if (failures.length) {
  throw new Error(`Build contract failed:\n- ${failures.join("\n- ")}`);
}

console.log("Build contract verified: main ESM, preload CJS, renderer assets relative, tray icon packaged.");
