import { spawnSync } from "node:child_process";

const targets = process.argv.slice(2);
if (targets.length === 0) targets.push("nsis");

const mirrorDefaults =
  process.env.GITHUB_ACTIONS === "true"
    ? {}
    : {
        ELECTRON_MIRROR: "https://npmmirror.com/mirrors/electron/",
        ELECTRON_CUSTOM_DIR: "{{ version }}",
        ELECTRON_BUILDER_BINARIES_MIRROR:
          "https://npmmirror.com/mirrors/electron-builder-binaries/"
      };

/** 本地默认走 npmmirror；GitHub Actions 使用 electron-builder 官方默认源。 */
const defaults = {
  ...mirrorDefaults,
  // 避免额外拉取签名工具导致 GitHub 连接失败
  CSC_IDENTITY_AUTO_DISCOVERY: "false"
};

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) process.env[key] = value;
}

console.log(
  [
    `[dist-win] targets=${targets.join(",")}`,
    `ELECTRON_MIRROR=${process.env.ELECTRON_MIRROR}`,
    `ELECTRON_BUILDER_BINARIES_MIRROR=${process.env.ELECTRON_BUILDER_BINARIES_MIRROR}`
  ].join("\n")
);

const result = spawnSync(
  "pnpm",
  ["exec", "electron-builder", "--win", ...targets, "--publish", "never"],
  { stdio: "inherit", env: process.env, shell: true }
);

process.exit(result.status ?? 1);
