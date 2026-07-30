import type { TranslationSession } from "../../shared/types";

/** Keeps only the latest interactive translation session in memory. */
export class TranslationSessionStore {
  private active: TranslationSession | undefined;

  getActive(): TranslationSession | undefined { return this.active && structuredClone(this.active); }
  create(input: Omit<TranslationSession, "id" | "createdAt" | "updatedAt">): TranslationSession {
    const now = Date.now();
    this.active = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    return this.getActive()!;
  }
  patch(requestId: string, patch: Partial<TranslationSession>): void {
    if (!this.active || this.active.requestId !== requestId) return;
    this.active = { ...this.active, ...patch, updatedAt: Date.now() };
  }
}
