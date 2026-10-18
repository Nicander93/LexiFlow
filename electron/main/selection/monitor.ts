export interface GlobalMouseEvent {
  button: number;
  x: number;
  y: number;
}

export interface GlobalMouseHook {
  on(event: "mousedown" | "mouseup", listener: (event: GlobalMouseEvent) => void): void;
  off(event: "mousedown" | "mouseup", listener: (event: GlobalMouseEvent) => void): void;
  start(): void;
  stop(): void;
}

export interface SelectionPoint {
  x: number;
  y: number;
}

/**
 * 监听全局鼠标拖选，只报告可能的文本选区，不读取剪贴板。
 */
export class SelectionMonitor {
  private running = false;
  private dragStart?: SelectionPoint;

  constructor(
    private readonly hook: GlobalMouseHook,
    private readonly onSelection: (point: SelectionPoint) => void,
    private readonly onPointerDown: (point: SelectionPoint) => void = () => undefined,
    private readonly normalizePoint: (point: SelectionPoint) => SelectionPoint = (point) => point,
    private readonly shouldShowTip: () => boolean = () => true
  ) {}

  private readonly handleMouseDown = (event: GlobalMouseEvent): void => {
    if (event.button !== 1) return;
    this.dragStart = { x: event.x, y: event.y };
    this.onPointerDown(this.normalizePoint(this.dragStart));
  };

  private readonly handleMouseUp = (event: GlobalMouseEvent): void => {
    if (event.button !== 1 || !this.dragStart) return;
    const distance = Math.hypot(event.x - this.dragStart.x, event.y - this.dragStart.y);
    this.dragStart = undefined;
    if (distance < 6 || !this.shouldShowTip()) return;

    const point = this.normalizePoint({ x: event.x, y: event.y });
    if (this.running) this.onSelection(point);
  };

  start(): void {
    if (this.running) return;
    this.running = true;
    this.hook.on("mousedown", this.handleMouseDown);
    this.hook.on("mouseup", this.handleMouseUp);
    try {
      this.hook.start();
    } catch (error) {
      this.hook.off("mousedown", this.handleMouseDown);
      this.hook.off("mouseup", this.handleMouseUp);
      this.running = false;
      throw error;
    }
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.dragStart = undefined;
    this.hook.off("mousedown", this.handleMouseDown);
    this.hook.off("mouseup", this.handleMouseUp);
    this.hook.stop();
  }
}
