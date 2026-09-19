/**
 * 下拉刷新：纯逻辑 + 触摸控制器。
 * 不依赖任何原生插件，纯 Web 触摸实现，Capacitor 原生壳与手机浏览器均可使用。
 * 仅当页面滚动到顶部、手指向下拉时才介入，避免影响正常滚动。
 */

export const PULL_THRESHOLD = 56;
export const MAX_PULL = 96;
export const HOLD_DISTANCE = 48;

export type PullPhase = "idle" | "pulling" | "ready" | "refreshing";

export interface PullState {
  phase: PullPhase;
  /** 当前下拉位移（px），用于驱动指示器 */
  distance: number;
}

/** 阻尼函数：越往下拉阻力越大，位移夹在 [0, MAX_PULL] */
export function dampDistance(deltaY: number): number {
  if (!Number.isFinite(deltaY) || deltaY <= 0) return 0;
  return Math.min(MAX_PULL, Math.round(deltaY * 0.45));
}

export function isAtTop(scrollTop: number): boolean {
  return scrollTop <= 0;
}

/** 拖动过程中根据位移决定阶段 */
export function nextPhaseOnMove(phase: PullPhase, distance: number): PullPhase {
  if (phase === "refreshing") return "refreshing";
  if (distance >= PULL_THRESHOLD) return "ready";
  if (distance > 0) return "pulling";
  return "idle";
}

/** 松手时是否应触发刷新（只有拉过阈值才触发） */
export function shouldTriggerOnRelease(phase: PullPhase): boolean {
  return phase === "ready";
}

export interface PullToRefreshHandlers {
  /** 触发刷新（松手拉过阈值）。可返回 Promise，期间保持刷新态。 */
  onRefresh: () => Promise<void> | void;
  /** 状态变化回调（驱动 UI） */
  onStateChange?: (state: PullState) => void;
  /** 自定义当前滚动位置（默认取 window.scrollY） */
  getScrollTop?: () => number;
  /** 是否启用（例如仅触摸设备）；返回 false 时完全不拦截 */
  enabled?: () => boolean;
}

const IDLE_STATE: PullState = { phase: "idle", distance: 0 };

export class PullToRefreshController {
  private startY = 0;
  private tracking = false;
  private state: PullState = IDLE_STATE;
  private refreshing = false;

  constructor(private readonly handlers: PullToRefreshHandlers) {}

  private getScrollTop(): number {
    if (this.handlers.getScrollTop) return this.handlers.getScrollTop();
    if (typeof window === "undefined") return 0;
    return window.scrollY || document.documentElement?.scrollTop || document.body?.scrollTop || 0;
  }

  private emit() {
    this.handlers.onStateChange?.({ ...this.state });
  }

  private reset() {
    this.state = IDLE_STATE;
    this.emit();
  }

  private onTouchStart = (event: Event) => {
    if (this.handlers.enabled && !this.handlers.enabled()) return;
    if (this.refreshing) return;
    const touch = (event as TouchEvent).touches?.[0];
    if (!touch) return;
    if (!isAtTop(this.getScrollTop())) {
      this.tracking = false;
      return;
    }
    this.startY = touch.clientY;
    this.tracking = true;
  };

  private onTouchMove = (event: Event) => {
    if (this.handlers.enabled && !this.handlers.enabled()) return;
    if (!this.tracking || this.refreshing) return;
    const touch = (event as TouchEvent).touches?.[0];
    if (!touch) return;
    const deltaY = touch.clientY - this.startY;
    // 只有在顶部且向下拉才接管手势；否则交还给浏览器正常滚动
    if (deltaY <= 0 || !isAtTop(this.getScrollTop())) {
      if (this.state.phase !== "idle") this.reset();
      return;
    }
    // 到达这里说明是「顶部下拉」，阻止页面橡皮筋/滚动
    if (typeof event.preventDefault === "function") event.preventDefault();
    const distance = dampDistance(deltaY);
    const phase = nextPhaseOnMove(this.state.phase, distance);
    this.state = { phase, distance };
    this.emit();
  };

  private onTouchEnd = () => {
    if (!this.tracking) return;
    this.tracking = false;
    if (this.refreshing) return;
    if (shouldTriggerOnRelease(this.state.phase)) {
      this.refreshing = true;
      this.state = { phase: "refreshing", distance: HOLD_DISTANCE };
      this.emit();
      void Promise.resolve()
        .then(() => this.handlers.onRefresh())
        .catch(() => undefined)
        .finally(() => {
          this.refreshing = false;
          this.reset();
        });
    } else {
      this.reset();
    }
  };

  /** 绑定到目标（通常是 document / 滚动容器） */
  attach(target: EventTarget): () => void {
    target.addEventListener("touchstart", this.onTouchStart, { passive: true });
    target.addEventListener("touchmove", this.onTouchMove, { passive: false });
    target.addEventListener("touchend", this.onTouchEnd, { passive: true });
    target.addEventListener("touchcancel", this.onTouchEnd, { passive: true });
    return () => this.detach(target);
  }

  detach(target: EventTarget) {
    target.removeEventListener("touchstart", this.onTouchStart);
    target.removeEventListener("touchmove", this.onTouchMove);
    target.removeEventListener("touchend", this.onTouchEnd);
    target.removeEventListener("touchcancel", this.onTouchEnd);
  }
}
