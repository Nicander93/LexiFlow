import type { TranslationMode } from "./translation";

export interface PopupPayload { mode: TranslationMode; profileId?: string; text?: string; error?: string; capturing?: boolean; }
