import { promises as fs } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const violations = [];

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (["node_modules", "dist", "dist-electron", ".git", "release"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (/\.(ts|tsx|vue|mjs)$/.test(entry.name)) files.push(path);
  }
  return files;
}

for (const file of await walk(root)) {
  const relativePath = relative(root, file).replaceAll("\\", "/");
  const source = await fs.readFile(file, "utf8");
  if (relativePath.startsWith("src/") && /(?:electron\/main|electron\\main)/.test(source)) violations.push(`${relativePath}: renderer imports electron/main directly`);
  if (relativePath.startsWith("src/") && /from\s+["']electron["']|require\(["']electron["']\)/.test(source)) violations.push(`${relativePath}: renderer imports Electron directly`);
  if (relativePath.startsWith("electron/main/domain/") && /from\s+["'](?:electron|node:|vue)|import\s+["'](?:electron|node:|vue)/.test(source)) violations.push(`${relativePath}: domain imports runtime/framework implementation`);
  if (relativePath.startsWith("electron/main/domain/") && /(?:\/main\/(?:provider|storage|ocr|window|ipc)|\.\.\/\.\.\/provider)/.test(source)) violations.push(`${relativePath}: domain imports infrastructure`);
  if (relativePath.startsWith("electron/main/application/") && /from\s+["'](?:electron|node:)|import\s+["'](?:electron|node:)/.test(source)) violations.push(`${relativePath}: application imports Electron/Node directly`);
  if (relativePath.startsWith("electron/main/application/") && /from\s+["'][^"']*\/storage\//.test(source)) violations.push(`${relativePath}: application imports storage implementation directly`);
  if (relativePath.startsWith("electron/main/interfaces/ipc/register-") && /from\s+["'](?:electron|node:)|import\s+["'](?:electron|node:)/.test(source)) violations.push(`${relativePath}: IPC registrar imports Electron/Node directly`);
  if (relativePath.startsWith("electron/main/interfaces/ipc/register-") && /from\s+["'][^"']*(?:provider|storage|clipboard|diagnostics)[^"']*["']/.test(source)) violations.push(`${relativePath}: IPC registrar imports infrastructure directly`);
  if (relativePath.startsWith("electron/shared/contracts/") && /electron\/main|\.\.\/main/.test(source)) violations.push(`${relativePath}: shared contract imports main implementation`);
  if (relativePath.startsWith("electron/preload/") && /ipcRenderer\.(invoke|send|on)\(\s*["'`]/.test(source)) violations.push(`${relativePath}: preload contains a raw IPC channel string`);
  if (relativePath.startsWith("electron/main/") && /\.webContents\.send\(\s*["'`]/.test(source)) violations.push(`${relativePath}: main contains a raw IPC channel string`);
}

if (violations.length) {
  console.error(violations.join("\n"));
  process.exit(1);
}
console.log("Architecture boundaries verified.");
