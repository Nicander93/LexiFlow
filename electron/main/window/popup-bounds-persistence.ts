export interface PopupBounds { width: number; height: number; }

/** Separates automatic layout resizes from user resizes and debounces disk writes. */
export class PopupBoundsPersistence {
  private adaptingPopup = false;
  private releaseTimer?: ReturnType<typeof setTimeout>;
  private saveTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly save: (bounds: PopupBounds) => void, private readonly userResizeDebounceMs = 300) {}

  beginProgrammaticResize(): void {
    this.adaptingPopup = true;
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = undefined;
      this.adaptingPopup = false;
    }, 500);
  }

  resized(getBounds: () => PopupBounds): void {
    if (this.adaptingPopup) {
      this.adaptingPopup = false;
      if (this.releaseTimer) clearTimeout(this.releaseTimer);
      this.releaseTimer = undefined;
      return;
    }
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      if (!this.adaptingPopup) this.save(getBounds());
    }, this.userResizeDebounceMs);
  }

  dispose(): void {
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.releaseTimer = undefined;
    this.saveTimer = undefined;
    this.adaptingPopup = false;
  }
}

