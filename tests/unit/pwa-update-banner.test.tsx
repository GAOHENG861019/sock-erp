import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import type { ReactNode } from "react";

// 可控的 SW 注册状态
const swState: { offline: boolean; refresh: boolean } = { offline: false, refresh: false };
const setOffline = (v: boolean) => { swState.offline = v; };
const setRefresh = (v: boolean) => { swState.refresh = v; };

// 记录 useRegisterSW 被调用的次数 —— 原生 APP 中必须为 0（完全不注册 SW）
const registerCalls = vi.fn();

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: (...args: unknown[]) => {
    registerCalls(...args);
    return {
      offlineReady: [swState.offline, (v: boolean) => { swState.offline = v; }],
      needRefresh: [swState.refresh, (v: boolean) => { swState.refresh = v; }],
      updateServiceWorker: vi.fn(async () => {}),
    };
  },
}));

import { PWAUpdateBanner } from "../../src/components/PWAUpdateBanner";

function setNative(native: boolean) {
  if (native) {
    (window as any).Capacitor = { isNativePlatform: () => true };
  } else {
    delete (window as any).Capacitor;
  }
}

beforeEach(() => {
  swState.offline = false;
  swState.refresh = false;
  registerCalls.mockClear();
  setNative(false);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  setNative(false);
});

describe("PWAUpdateBanner", () => {
  it("无任何状态时不渲染", () => {
    const { container } = render(<PWAUpdateBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("浏览器环境会注册 Service Worker（离线能力）", () => {
    render(<PWAUpdateBanner />);
    expect(registerCalls).toHaveBeenCalled();
  });

  it("浏览器环境离线就绪时显示提示", () => {
    setOffline(true);
    render(<PWAUpdateBanner />);
    expect(screen.getByText("应用已可离线使用")).toBeInTheDocument();
  });

  it("浏览器环境离线就绪提示在 3 秒后自动消失，不长期遮挡弹窗按钮", () => {
    setOffline(true);
    render(<PWAUpdateBanner />);
    expect(screen.getByText("应用已可离线使用")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByText("应用已可离线使用")).not.toBeInTheDocument();
  });

  it("发现新版本的提示不会自动消失（需要用户主动更新）", () => {
    setRefresh(true);
    render(<PWAUpdateBanner />);
    act(() => { vi.advanceTimersByTime(10000); });
    expect(screen.getByText("发现新版本，点击更新")).toBeInTheDocument();
  });

  it("原生手机 APP（Capacitor）中不渲染离线提示，避免遮挡弹窗保存按钮", () => {
    setNative(true);
    setOffline(true);
    const { container } = render(<PWAUpdateBanner />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("应用已可离线使用")).not.toBeInTheDocument();
  });

  it("原生手机 APP 中完全不注册 Service Worker（否则会拦截热更新返回旧资源）", () => {
    setNative(true);
    setOffline(true);
    setRefresh(true);
    render(<PWAUpdateBanner />);
    expect(registerCalls).not.toHaveBeenCalled();
  });

  it("原生手机 APP 中即使发现新版本也不渲染（热更新由 Capgo 负责）", () => {
    setNative(true);
    setRefresh(true);
    const { container } = render(<PWAUpdateBanner />);
    expect(container).toBeEmptyDOMElement();
    expect(registerCalls).not.toHaveBeenCalled();
  });
});
