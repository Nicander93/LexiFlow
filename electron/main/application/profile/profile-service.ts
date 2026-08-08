import type { TranslationProfile } from "../../../shared/types";

export interface ProfileRepository {
  list(): TranslationProfile[];
  upsert(profile: TranslationProfile): Promise<TranslationProfile>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

/** Application-facing Profile operations. */
export class ProfileService {
  constructor(private readonly store: ProfileRepository) {}

  list(): TranslationProfile[] { return this.store.list(); }
  upsert(profile: TranslationProfile): Promise<TranslationProfile> { return this.store.upsert(profile); }
  delete(id: string): Promise<void> { return this.store.delete(id); }
  clear(): Promise<void> { return this.store.clear(); }
}
