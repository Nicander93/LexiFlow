import { promises as fs } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const files = [];
async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (["node_modules", "dist", "dist-electron", ".git", "release"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.(ts|tsx|vue|mjs|json)$/.test(entry.name)) files.push(path);
  }
}
await walk(root);
const failures = [];
for (const file of files) {
  const lines = (await fs.readFile(file, "utf8")).split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/[ \t]+$/.test(line)) failures.push(`${relative(root, file)}:${index + 1}: trailing whitespace`);
  });
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Formatting hygiene verified.");
