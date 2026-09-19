import { isNativeApp } from "./plugins/AppUpdate";

/**
 * 在 Capacitor 原生手机 APP 中彻底停用 Service Worker。
 *
 * 背景：旧版本（1.3.0 及更早）在原生 APP 里也注册了 PWA 的 Service Worker。
 * workbox 的 navigateFallback 会缓存 index.html，Capgo 热更新切换到新 bundle 后，
 * 旧 SW 仍然拦截导航请求并返回旧缓存，导致热更新看似成功、实际永远跑旧版本
 * （表现为手机端的修复始终到不了、原材料无法添加等）。
 *
 * 新版本已经在原生环境不注册 SW（见 PWAUpdateBanner）；本函数负责清理用户手机上
 * 旧版本残留的 SW 与 workbox 缓存，必须在应用启动、React 渲染之前尽早执行。
 */
export function cleanupServiceWorkerInNative(): void {
  if (!isNativeApp()) return;

  try {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          for (const registration of registrations) {
            registration
              .unregister()
              .catch(() => {
                /* 忽略单个注销失败 */
              });
          }
        })
        .catch(() => {
          /* 忽略 */
        });
    }
  } catch {
    /* 忽略 */
  }

  try {
    if (typeof caches !== "undefined" && typeof caches.keys === "function") {
      caches
        .keys()
        .then((keys) => {
          for (const key of keys) {
            caches.delete(key).catch(() => {
              /* 忽略 */
            });
          }
        })
        .catch(() => {
          /* 忽略 */
        });
    }
  } catch {
    /* 忽略 */
  }
}
