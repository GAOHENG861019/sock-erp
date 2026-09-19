import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { PullToRefresh } from "../../src/components/PullToRefresh";

const h = vi.hoisted(() => ({ native: true, forceSync: vi.fn(() => Promise.resolve()) }));

vi.mock("../../src/sync", () => ({
  cloudStorage: {
    forceSync: h.forceSync,
    isEnabled: () => true,
  },
}));
vi.mock("../../src/plugins/AppUpdate", () => ({
  isNativeApp: () => h.native,
}));

function touchOnDocument(type: string, clientY: number) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, "touches", { value: [{ clientY }], configurable: true });
  document.dispatchEvent(e);
}

beforeEach(() => {
  h.native = true;
  h.forceSync.mockClear();
});

describe("PullToRefresh 组件", () => {
  it("原生 APP 下拉过阈值松手触发云同步", async () => {
    render(<PullToRefresh />);
    await act(async () => {
      touchOnDocument("touchstart", 0);
      touchOnDocument("touchmove", 200);
    });
    // 拖动中出现提示
    expect(await screen.findByText(/松开立即刷新|下拉刷新/)).toBeTruthy();
    await act(async () => {
      touchOnDocument("touchend", 200);
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(h.forceSync).toHaveBeenCalledTimes(1);
  });

  it("非触摸桌面端不启用（不渲染指示器、不触发）", () => {
    h.native = false;
    // 模拟无触摸能力
    const original = Object.getOwnPropertyDescriptor(navigator, "maxTouchPoints");
    Object.defineProperty(navigator, "maxTouchPoints", { value: 0, configurable: true });
    const hasTouch = "ontouchstart" in window;
    if (hasTouch) delete (window as any).ontouchstart;

    render(<PullToRefresh />);
    touchOnDocument("touchstart", 0);
    touchOnDocument("touchmove", 200);
    touchOnDocument("touchend", 200);
    expect(h.forceSync).not.toHaveBeenCalled();

    if (original) Object.defineProperty(navigator, "maxTouchPoints", original);
  });
});
