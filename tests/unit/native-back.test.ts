import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// 模拟 @capacitor/app
const backHandlers: Array<() => void> = [];
const removeMock = vi.fn();
const exitAppMock = vi.fn();
const addListenerMock = vi.fn(async (event: string, handler: () => void) => {
  if (event === "backButton") backHandlers.push(handler);
  return { remove: removeMock };
});

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: (...args: unknown[]) => addListenerMock(...(args as [string, () => void])),
    exitApp: () => exitAppMock(),
  },
}));

function setNative(native: boolean) {
  if (native) {
    (window as any).Capacitor = { isNativePlatform: () => true };
  } else {
    delete (window as any).Capacitor;
  }
}

function pressBack() {
  backHandlers.forEach((h) => h());
}

import { setupNativeBackButton, closeTopmostOverlay, EXIT_DOUBLE_PRESS_MS } from "../../src/native-back";

describe("closeTopmostOverlay", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("打开 Modal 时派发 Escape 并拦截返回", () => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    let receivedEscape = false;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") receivedEscape = true; };
    document.addEventListener("keydown", onKey);
    document.body.appendChild(backdrop);
    expect(closeTopmostOverlay()).toBe(true);
    expect(receivedEscape).toBe(true);
    document.removeEventListener("keydown", onKey);
  });

  it("手机侧边菜单打开时点击遮罩关闭并拦截返回", () => {
    const shell = document.createElement("div");
    shell.className = "app-shell mobile-menu-open";
    const overlay = document.createElement("div");
    overlay.className = "mobile-overlay";
    let clicked = false;
    overlay.addEventListener("click", () => { clicked = true; });
    shell.appendChild(overlay);
    document.body.appendChild(shell);
    expect(closeTopmostOverlay()).toBe(true);
    expect(clicked).toBe(true);
  });

  it("没有弹层时返回 false", () => {
    expect(closeTopmostOverlay()).toBe(false);
  });
});

describe("setupNativeBackButton", () => {
  beforeEach(() => {
    backHandlers.length = 0;
    removeMock.mockClear();
    exitAppMock.mockClear();
    addListenerMock.mockClear();
    document.body.innerHTML = "";
    setNative(true);
  });

  afterEach(() => {
    setNative(false);
    document.body.innerHTML = "";
  });

  it("非原生环境不注册返回键监听", () => {
    setNative(false);
    setupNativeBackButton(() => ({ pathname: "/" }), vi.fn());
    expect(addListenerMock).not.toHaveBeenCalled();
  });

  it("非首页按返回键调用 navigate(-1)", () => {
    const navigate = vi.fn();
    setupNativeBackButton(() => ({ pathname: "/fanwa" }), navigate);
    expect(backHandlers.length).toBe(1);
    pressBack();
    expect(navigate).toHaveBeenCalledWith(-1);
    expect(exitAppMock).not.toHaveBeenCalled();
  });

  it("首页第一次按返回键显示提示，不退出", () => {
    const navigate = vi.fn();
    setupNativeBackButton(() => ({ pathname: "/" }), navigate);
    pressBack();
    expect(exitAppMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("再按一次返回键退出应用");
  });

  it("首页在间隔内连续按两次返回键退出应用", () => {
    setupNativeBackButton(() => ({ pathname: "/" }), vi.fn());
    pressBack();
    pressBack();
    expect(exitAppMock).toHaveBeenCalledTimes(1);
  });

  it("超过双击间隔后再按，重新提示而非退出", () => {
    vi.useFakeTimers();
    setupNativeBackButton(() => ({ pathname: "/" }), vi.fn());
    pressBack();
    vi.advanceTimersByTime(EXIT_DOUBLE_PRESS_MS + 100);
    pressBack();
    expect(exitAppMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("再按一次返回键退出应用");
    vi.useRealTimers();
  });

  it("弹层打开时优先关闭弹层，不触发路由返回", () => {
    const navigate = vi.fn();
    setupNativeBackButton(() => ({ pathname: "/fanwa" }), navigate);
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    document.body.appendChild(backdrop);
    pressBack();
    expect(navigate).not.toHaveBeenCalled();
  });
});
