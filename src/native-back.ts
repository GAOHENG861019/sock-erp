import { App } from "@capacitor/app";
import type { NavigateFunction } from "react-router-dom";
import { isNativeApp } from "./plugins/AppUpdate";

/** 双击返回键退出的间隔时间（毫秒） */
export const EXIT_DOUBLE_PRESS_MS = 2000;

let toastEl: HTMLDivElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

/** 在屏幕底部显示一次“再按一次退出”的轻量提示，不依赖任何 React 状态。 */
export function showExitHint(): void {
  if (toastEl) toastEl.remove();
  if (toastTimer) clearTimeout(toastTimer);
  toastEl = document.createElement("div");
  toastEl.textContent = "再按一次返回键退出应用";
  Object.assign(toastEl.style, {
    position: "fixed",
    left: "50%",
    bottom: "72px",
    transform: "translateX(-50%)",
    background: "rgba(20,20,28,0.88)",
    color: "#fff",
    padding: "10px 20px",
    borderRadius: "10px",
    fontSize: "14px",
    lineHeight: 1.4,
    zIndex: "10000",
    pointerEvents: "none",
    whiteSpace: "nowrap",
    boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
  });
  document.body.appendChild(toastEl);
  toastTimer = setTimeout(() => {
    toastEl?.remove();
    toastEl = null;
    toastTimer = null;
  }, EXIT_DOUBLE_PRESS_MS);
}

/**
 * 关闭最上层的弹层（模态框 / 手机侧边菜单）。
 * 返回 true 表示已拦截返回键、由弹层处理；false 表示没有弹层，应继续路由 / 退出逻辑。
 */
export function closeTopmostOverlay(): boolean {
  // 1) 任意打开的 Modal 组件（监听 document 上的 Escape 关闭）
  const backdrop = document.querySelector(".modal-backdrop");
  if (backdrop) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return true;
  }
  // 2) 手机端左侧导航抽屉
  const shell = document.querySelector(".app-shell.mobile-menu-open");
  if (shell) {
    const overlay = document.querySelector(".mobile-overlay");
    if (overlay instanceof HTMLElement) {
      overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
    return true;
  }
  return false;
}

/**
 * 安装安卓返回键处理：
 * 1) 有模态框 / 抽屉时先关闭；
 * 2) 非首页时返回上一页；
 * 3) 首页时 2 秒内再按一次退出应用。
 * 仅在 Capacitor 原生环境生效，浏览器环境不处理（保留浏览器默认行为）。
 *
 * 返回一个清理函数，在组件卸载时移除监听。
 */
export function setupNativeBackButton(
  getLocation: () => { pathname: string },
  navigate: NavigateFunction,
): () => void {
  if (!isNativeApp()) return () => {};

  let lastPress = 0;
  let removed = false;
  let removeListener: (() => void) | null = null;

  void App.addListener("backButton", () => {
    if (closeTopmostOverlay()) return;
    const { pathname } = getLocation();
    if (pathname !== "/") {
      navigate(-1);
      return;
    }
    const now = Date.now();
    if (now - lastPress < EXIT_DOUBLE_PRESS_MS) {
      void App.exitApp();
    } else {
      lastPress = now;
      showExitHint();
    }
  }).then((handle) => {
    if (removed) {
      void handle.remove();
    } else {
      removeListener = () => void handle.remove();
    }
  });

  return () => {
    removed = true;
    removeListener?.();
  };
}
