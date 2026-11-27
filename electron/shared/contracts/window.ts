import type { TranslationMode } from "./translation";

export interface PopupPayload { mode: TranslationMode; profileId?: string; text?: string; error?: string; capturing?: boolean; }
export interface WindowNavigation { route: string; draft?: { text: string; requestId?: string }; }
