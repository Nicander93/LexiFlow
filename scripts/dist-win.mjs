import { spawnSync } from "node:child_process";

const target = process.argv[2] || "nsis";

if (!process.env.ELECTRON_MIRROR) {
  process.env.ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/";
}

if (!process.env.ELECTRON_BUILDER_BINARIES_MIRROR) {
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR =
    "https://npmmirror.com/mirrors/electron-builder-binaries/";
}

const result = spawnSync(
  "npx",
  ["electron-builder", "--win", target],
  { stdio: "inherit", env: process.env, shell: true },
);

process.exit(result.status ?? 1);
