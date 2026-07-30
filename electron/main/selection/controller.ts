import { SelectionMonitor, type GlobalMouseHook, type SelectionPoint } from "./monitor";

interface SelectionControllerOptions {
  hook: GlobalMouseHook;
  capture: () => Promise<{ text: string; error?: string }>;
  normalizePoint: (point: SelectionPoint) => SelectionPoint;
  showTip: (point: SelectionPoint) => void;
  hideTip: () => void;
  isTipPoint: (point: SelectionPoint) => boolean;
  onConfirm: (text: string) => void;
}

/**
 * 统一管理划词监听、待确认文本和悬浮提示生命周期。
 */
export class SelectionController {
  private pendingText = "";
  private readonly monitor: SelectionMonitor;

  constructor(private readonly options: SelectionControllerOptions) {
    this.monitor = new SelectionMonitor(
      options.hook,
      options.capture,
      (text, point) => {
        this.pendingText = text;
        options.showTip(point);
      },
      (point) => {
        if (options.isTipPoint(point)) return;
        this.dismiss();
      },
      options.normalizePoint
    );
  }

  setEnabled(enabled: boolean): void {
    if (enabled) {
      this.monitor.start();
      return;
    }
    this.monitor.stop();
    this.dismiss();
  }

  confirm(): void {
    const text = this.pendingText;
    this.dismiss();
    if (text) this.options.onConfirm(text);
  }

  dismiss(): void {
    this.pendingText = "";
    this.options.hideTip();
  }

  dispose(): void {
    this.monitor.stop();
    this.dismiss();
  }
}
