import { isNativeApp } from "./plugins/AppUpdate";

/**
 * 在 Capacitor 原生手机 APP 中彻底停用 Service Worker。
 *
 * 背景：旧版本（1.3.0 及更早）在原生 APP 里也注册了 PWA 的 Service Worker。
 * workbox 的 navigateFallback 会缓存 index.html，Capgo 热更新切换到新 bundle 后，
 * 旧 SW 仍然拦截导航请求并返回旧缓存，导致热更新看似成功、实际永远跑旧版本
 * （表现为手机端的修复始终到不了、原材料无法添加等）。
 *
 * 新版本已经在原生环境不注册 SW（见 PWAUpdateBanner）；热更新 bundle 也会用
 * 自毁 SW（scripts/native-kill-sw.js）替换 workbox sw.js。本函数负责：
 *   1. 清理用户手机上旧版本残留的 SW 与 workbox 缓存；
 *   2. 若当前页面仍被旧 SW 控制（说明本次加载可能来自缓存），清理后受控 reload 一次，
 *      保证从 Capacitor 本地资源加载最新 bundle。
 * 必须在应用启动、React 渲染之前尽早执行。
 */
const RELOAD_FLAG = "sock-erp-sw-reloaded";

export function cleanupServiceWorkerInNative(): void {
  if (!isNativeApp()) return;

  const run = async (): Promise<void> => {
    let hadController = false;
    let registrationCount = 0;

    try {
      if ("serviceWorker" in navigator) {
        // 当前页面是否被某个 SW 控制；若是，本次加载可能来自旧缓存
        hadController = Boolean(navigator.serviceWorker.controller);
        const registrations = await navigator.serviceWorker.getRegistrations();
        registrationCount = registrations.length;
        await Promise.all(
          registrations.map((registration) =>
            registration.unregister().catch(() => false),
          ),
        );
      }
    } catch {
      /* 忽略 SW 注销异常 */
    }

    try {
      if (typeof caches !== "undefined" && typeof caches.keys === "function") {
        const keys = await caches.keys();
        await Promise.all(
          keys.map((key) => caches.delete(key).catch(() => false)),
        );
      }
    } catch {
      /* 忽略缓存清理异常 */
    }

    // 仅当此前确实有 SW 控制着页面时才 reload；用 sessionStorage 标记保证最多 reload 一次，
    // 避免 SW 残留时陷入无限刷新。reload 后 SW 已注销，页面从 Capacitor 本地资源加载。
    const alreadyReloaded = (() => {
      try {
        return Boolean(sessionStorage.getItem(RELOAD_FLAG));
      } catch {
        return false;
      }
    })();

    if ((hadController || registrationCount > 0) && !alreadyReloaded) {
      try {
        sessionStorage.setItem(RELOAD_FLAG, "1");
      } catch {
        /* 忽略存储异常 */
      }
      window.location.reload();
    }
  };

  void run();
}
