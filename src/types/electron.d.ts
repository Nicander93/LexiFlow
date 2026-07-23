import type { TranslatorApi } from "../../electron/shared/api";

declare global {
  interface Window {
    translator?: TranslatorApi;
  }
}

export {};
