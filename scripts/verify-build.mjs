import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = resolve(import.meta.dirname, "..");
const files = {
  main: resolve(root, "dist-electron/main/index.js"),
  preload: resolve(root, "dist-electron/preload/index.cjs"),
  renderer: resolve(root, "dist/index.html")
};
const dictionaryDb = resolve(root, "resources/dictionaries/ecdict-core.db");
const dictionaryManifest = resolve(root, "resources/dictionaries/manifest.json");
const dictionaryNotice = resolve(root, "resources/dictionaries/NOTICE.md");

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

try {
  await access(dictionaryDb);
  await access(dictionaryManifest);
  await access(dictionaryNotice);
} catch {
  failures.push("dictionary resources missing (ecdict-core.db / manifest.json / NOTICE.md)");
}

const extraResources = packageJson.build?.extraResources ?? [];
const hasDictionaryResource = extraResources.some((item) =>
  item && typeof item === "object" && item.from === "resources/dictionaries" && item.to === "dictionaries"
);
if (!hasDictionaryResource) failures.push("package.json.build.extraResources does not include dictionaries");

if (!failures.includes("dictionary resources missing (ecdict-core.db / manifest.json / NOTICE.md)")) {
  const manifest = JSON.parse(await readFile(dictionaryManifest, "utf8"));
  if (!manifest.schemaVersion || !manifest.entryCount) failures.push("dictionary manifest is incomplete");

  const db = new DatabaseSync(dictionaryDb, { readOnly: true, timeout: 1000 });
  try {
    db.exec("PRAGMA query_only = ON;");
    const schema = db.prepare("SELECT value FROM metadata WHERE key = ?").get("schema_version");
    if (String(schema?.value) !== "1") failures.push("dictionary metadata.schema_version is not 1");
    const row = db.prepare("SELECT word, translation FROM entries WHERE word = ? COLLATE NOCASE LIMIT 1").get("sorry");
    if (!row?.word || !row?.translation) failures.push("dictionary lookup for 'sorry' failed");
  } catch (error) {
    failures.push(`dictionary sqlite verification failed: ${error instanceof Error ? error.message : error}`);
  } finally {
    db.close();
  }

  const size = (await stat(dictionaryDb)).size;
  if (size <= 0) failures.push("dictionary database is empty");
}

if (main.includes("node:sqlite") === false && !main.includes("DatabaseSync")) {
  // Bundlers may keep the builtin import; either form is acceptable if externalized.
}
if (/from\s*["']node:sqlite["']/.test(main) === false && !main.includes("node:sqlite")) {
  // If sqlite code is tree-shaken out, fail — dictionary repository must remain in main bundle.
  if (!main.includes("dictionary") && !main.includes("Ecdict")) {
    failures.push("main bundle does not appear to include dictionary support");
  }
}
if (main.includes("better-sqlite3") || main.includes("node_modules/sqlite3")) {
  failures.push("main bundle unexpectedly includes native sqlite package");
}

if (failures.length) {
  throw new Error(`Build contract failed:\n- ${failures.join("\n- ")}`);
}

console.log("Build contract verified: main ESM, preload CJS, renderer assets relative, tray icon packaged, dictionary resources present.");
