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

interface CapturedSelection {
  text: string;
  error?: string;
}

export interface SelectionPoint {
  x: number;
  y: number;
}

/**
 * 监听全局鼠标拖选，在原应用仍持有焦点时读取选区。
 */
export class SelectionMonitor {
  private running = false;
  private dragStart?: SelectionPoint;
  private captureSequence = 0;

  constructor(
    private readonly hook: GlobalMouseHook,
    private readonly capture: () => Promise<CapturedSelection>,
    private readonly onSelection: (text: string, point: SelectionPoint) => void,
    private readonly onPointerDown: (point: SelectionPoint) => void = () => undefined,
    private readonly normalizePoint: (point: SelectionPoint) => SelectionPoint = (point) => point
  ) {}

  private readonly handleMouseDown = (event: GlobalMouseEvent): void => {
    if (event.button !== 1) return;
    this.captureSequence += 1;
    this.dragStart = { x: event.x, y: event.y };
    this.onPointerDown(this.normalizePoint(this.dragStart));
  };

  private readonly handleMouseUp = (event: GlobalMouseEvent): void => {
    if (event.button !== 1 || !this.dragStart) return;
    const distance = Math.hypot(event.x - this.dragStart.x, event.y - this.dragStart.y);
    this.dragStart = undefined;
    if (distance < 6) return;

    const sequence = ++this.captureSequence;
    const point = this.normalizePoint({ x: event.x, y: event.y });
    void this.capture().then((result) => {
      if (!this.running || sequence !== this.captureSequence || !result.text.trim()) return;
      this.onSelection(result.text, point);
    });
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
    this.captureSequence += 1;
    this.dragStart = undefined;
    this.hook.off("mousedown", this.handleMouseDown);
    this.hook.off("mouseup", this.handleMouseUp);
    this.hook.stop();
  }
}
