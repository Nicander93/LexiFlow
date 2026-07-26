import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import electron from "vite-plugin-electron/simple";

const fromRoot = (path: string) => resolve(__dirname, path);

export default defineConfig({
  plugins: [
    vue(),
    electron({
      main: {
        entry: fromRoot("electron/main/index.ts"),
        vite: {
          build: {
            outDir: fromRoot("dist-electron/main"),
            rolldownOptions: {
              external: ["pdf-parse", "@napi-rs/canvas", "node:sqlite"],
              output: {
                entryFileNames: "index.js"
              }
            }
          }
        }
      },
      preload: {
        input: fromRoot("electron/preload/index.ts"),
        vite: {
          build: {
            outDir: fromRoot("dist-electron/preload"),
            rolldownOptions: {
              output: {
                format: "cjs",
                entryFileNames: "index.cjs"
              }
            }
          }
        }
      }
    })
  ],
  resolve: {
    alias: {
      "@": fromRoot("src"),
      "@shared": fromRoot("electron/shared")
    }
  },
  build: {
    outDir: fromRoot("dist"),
    rolldownOptions: {
      input: fromRoot("index.html")
    }
  }
});
