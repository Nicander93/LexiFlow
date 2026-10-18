import { SelectionMonitor, type GlobalMouseHook, type SelectionPoint } from "./monitor";
import type { SelectionResult } from "../../shared/types";

interface SelectionControllerOptions {
  hook: GlobalMouseHook;
  capture: () => Promise<{ text: string; error?: string }>;
  normalizePoint: (point: SelectionPoint) => SelectionPoint;
  showTip: (point: SelectionPoint) => void;
  hideTip: () => void;
  isTipPoint: (point: SelectionPoint) => boolean;
  onConfirm: (result: SelectionResult) => void;
  shouldShowTip?: () => boolean;
  tipDurationMs?: number;
}

/**
 * 统一管理划词监听、待确认选区和悬浮提示生命周期。
 */
export class SelectionController {
  private pending = false;
  private captureSequence = 0;
  private captureTask?: Promise<SelectionResult>;
  private tipTimer?: ReturnType<typeof setTimeout>;
  private readonly monitor: SelectionMonitor;

  constructor(private readonly options: SelectionControllerOptions) {
    this.monitor = new SelectionMonitor(
      options.hook,
      (point) => {
        this.pending = true;
        this.clearTipTimer();
        this.tipTimer = setTimeout(() => this.dismiss(), options.tipDurationMs ?? 5_000);
        options.showTip(point);
      },
      (point) => {
        if (options.isTipPoint(point)) return;
        this.dismiss();
      },
      options.normalizePoint,
      options.shouldShowTip
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
    if (!this.pending || this.captureTask) return;
    this.pending = false;
    this.clearTipTimer();
    this.options.hideTip();

    const sequence = ++this.captureSequence;
    const task = this.options.capture();
    this.captureTask = task;
    void task.then(
      (result) => {
        if (sequence === this.captureSequence) this.options.onConfirm(result);
      },
      () => {
        if (sequence === this.captureSequence) {
          this.options.onConfirm({ text: "", error: "读取选中文字失败，请改用手动输入。" });
        }
      }
    ).finally(() => {
      if (this.captureTask === task) this.captureTask = undefined;
    });
  }

  dismiss(): void {
    this.pending = false;
    this.captureSequence += 1;
    this.clearTipTimer();
    this.options.hideTip();
  }

  private clearTipTimer(): void {
    if (this.tipTimer) clearTimeout(this.tipTimer);
    this.tipTimer = undefined;
  }

  dispose(): void {
    this.monitor.stop();
    this.dismiss();
  }
}
