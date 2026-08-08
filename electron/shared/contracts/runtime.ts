export interface ProviderModel { id: string; name: string; }
export interface ProviderHealth { ok: boolean; message: string; }
export interface SelectionResult { text: string; error?: string; }
export interface RuntimeInfo { apiVersion: 2; electron: string; platform: string; }
export interface ShortcutRegistrationResult { translation: boolean; naming: boolean; screenshot: boolean; errors: string[]; }
