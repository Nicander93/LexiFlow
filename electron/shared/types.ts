/**
 * Compatibility entrypoint for existing main/preload imports.
 * New IPC DTOs belong in the corresponding file under shared/contracts.
 */
export type * from "./contracts/translation";
export type * from "./contracts/settings";
export type * from "./contracts/glossary";
export type * from "./contracts/document";
export type * from "./contracts/ocr";
export type * from "./contracts/dictionary";
export type * from "./contracts/history";
export type * from "./contracts/runtime";
export type * from "./contracts/window";
export { IPC_CHANNELS } from "./contracts/channels";
