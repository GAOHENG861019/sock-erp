import { describe, it, expect, vi } from "vitest";
import {
  PULL_THRESHOLD,
  MAX_PULL,
  dampDistance,
  isAtTop,
  nextPhaseOnMove,
  shouldTriggerOnRelease,
  PullToRefreshController,
  type PullState,
} from "../../src/pull-refresh";

function touchEvent(type: string, clientY: number): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, "touches", { value: [{ clientY }], configurable: true });
  return e;
}

describe("下拉刷新纯函数", () => {
  it("dampDistance 对非正位移返回 0", () => {
    expect(dampDistance(0)).toBe(0);
    expect(dampDistance(-100)).toBe(0);
    expect(dampDistance(NaN)).toBe(0);
  });

  it("dampDistance 有阻尼且不超过上限", () => {
    expect(dampDistance(100)).toBe(45);
    expect(dampDistance(100000)).toBe(MAX_PULL);
  });

  it("isAtTop 判定", () => {
    expect(isAtTop(0)).toBe(true);
    expect(isAtTop(-1)).toBe(true);
    expect(isAtTop(10)).toBe(false);
  });

  it("nextPhaseOnMove 随位移切换阶段", () => {
    expect(nextPhaseOnMove("idle", 0)).toBe("idle");
    expect(nextPhaseOnMove("idle", 20)).toBe("pulling");
    expect(nextPhaseOnMove("pulling", PULL_THRESHOLD)).toBe("ready");
    expect(nextPhaseOnMove("ready", PULL_THRESHOLD + 10)).toBe("ready");
  });

  it("refreshing 阶段不被移动改变", () => {
    expect(nextPhaseOnMove("refreshing", 0)).toBe("refreshing");
  });

  it("只有 ready 松手才触发", () => {
    expect(shouldTriggerOnRelease("ready")).toBe(true);
    expect(shouldTriggerOnRelease("pulling")).toBe(false);
    expect(shouldTriggerOnRelease("idle")).toBe(false);
  });
});

describe("PullToRefreshController", () => {
  it("顶部下拉超过阈值后松手触发 onRefresh", async () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    const states: PullState[] = [];
    const c = new PullToRefreshController({
      onRefresh,
      getScrollTop: () => 0,
      onStateChange: (s) => states.push(s),
    });
    const el = document.createElement("div");
    c.attach(el);

    el.dispatchEvent(touchEvent("touchstart", 0));
    el.dispatchEvent(touchEvent("touchmove", 200)); // 阻尼后 90px，超过阈值
    el.dispatchEvent(touchEvent("touchend", 200));

    // 刷新是异步的
    await Promise.resolve();
    await Promise.resolve();

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(states.some((s) => s.phase === "ready")).toBe(true);
    expect(states.some((s) => s.phase === "refreshing")).toBe(true);
  });

  it("下拉未到阈值松手不触发", () => {
    const onRefresh = vi.fn();
    const c = new PullToRefreshController({ onRefresh, getScrollTop: () => 0 });
    const el = document.createElement("div");
    c.attach(el);

    el.dispatchEvent(touchEvent("touchstart", 0));
    el.dispatchEvent(touchEvent("touchmove", 40)); // 阻尼后 18px < 阈值
    el.dispatchEvent(touchEvent("touchend", 40));

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("页面已向下滚动（scrollTop>0）时下拉不拦截、不触发", () => {
    const onRefresh = vi.fn();
    const c = new PullToRefreshController({ onRefresh, getScrollTop: () => 300 });
    const el = document.createElement("div");
    c.attach(el);

    el.dispatchEvent(touchEvent("touchstart", 0));
    const move = touchEvent("touchmove", 200);
    el.dispatchEvent(move);
    el.dispatchEvent(touchEvent("touchend", 200));

    expect(move.defaultPrevented).toBe(false);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("顶部下拉的 touchmove 会 preventDefault 阻止页面滚动", () => {
    const c = new PullToRefreshController({ onRefresh: () => undefined, getScrollTop: () => 0 });
    const el = document.createElement("div");
    c.attach(el);

    el.dispatchEvent(touchEvent("touchstart", 0));
    const move = touchEvent("touchmove", 200);
    el.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(true);
  });

  it("enabled 返回 false 时完全不拦截", () => {
    const onRefresh = vi.fn();
    const c = new PullToRefreshController({
      onRefresh,
      getScrollTop: () => 0,
      enabled: () => false,
    });
    const el = document.createElement("div");
    c.attach(el);

    el.dispatchEvent(touchEvent("touchstart", 0));
    const move = touchEvent("touchmove", 200);
    el.dispatchEvent(move);
    el.dispatchEvent(touchEvent("touchend", 200));

    expect(move.defaultPrevented).toBe(false);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("刷新完成后状态回到 idle，可再次触发", async () => {
    let resolveRefresh: () => void = () => undefined;
    const onRefresh = vi.fn(
      () => new Promise<void>((resolve) => { resolveRefresh = resolve; }),
    );
    const states: PullState[] = [];
    const c = new PullToRefreshController({
      onRefresh,
      getScrollTop: () => 0,
      onStateChange: (s) => states.push(s),
    });
    const el = document.createElement("div");
    c.attach(el);

    el.dispatchEvent(touchEvent("touchstart", 0));
    el.dispatchEvent(touchEvent("touchmove", 200));
    el.dispatchEvent(touchEvent("touchend", 200));
    await Promise.resolve();
    expect(onRefresh).toHaveBeenCalledTimes(1);

    resolveRefresh();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(states[states.length - 1].phase).toBe("idle");
  });
});
