import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// 安装/卸载假的 serviceWorker 与 caches API
function installBrowserApis() {
  const unregister = vi.fn(async () => true);
  const getRegistrations = vi.fn(async () => [{ unregister }]);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistrations },
  });

  const deleteCache = vi.fn(async () => true);
  const cacheKeys = vi.fn(async () => ["workbox-cache", "api-cache"]);
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: { keys: cacheKeys, delete: deleteCache },
  });

  return { unregister, getRegistrations, deleteCache, cacheKeys };
}

function setNative(native: boolean) {
  if (native) {
    (window as any).Capacitor = { isNativePlatform: () => true };
  } else {
    delete (window as any).Capacitor;
  }
}

describe("cleanupServiceWorkerInNative", () => {
  let apis: ReturnType<typeof installBrowserApis>;

  beforeEach(() => {
    apis = installBrowserApis();
    setNative(false);
  });

  afterEach(() => {
    setNative(false);
    delete (navigator as any).serviceWorker;
    delete (globalThis as any).caches;
    vi.resetModules();
  });

  it("浏览器环境不注销任何 Service Worker（保留离线能力）", async () => {
    const { cleanupServiceWorkerInNative } = await import("../../src/native-sw-cleanup");
    cleanupServiceWorkerInNative();
    await Promise.resolve();
    expect(apis.getRegistrations).not.toHaveBeenCalled();
    expect(apis.cacheKeys).not.toHaveBeenCalled();
  });

  it("原生 APP 中注销所有残留 Service Worker", async () => {
    setNative(true);
    const { cleanupServiceWorkerInNative } = await import("../../src/native-sw-cleanup");
    cleanupServiceWorkerInNative();
    // 等待内部 Promise 微任务完成
    await vi.waitFor(() => expect(apis.unregister).toHaveBeenCalled());
    expect(apis.getRegistrations).toHaveBeenCalled();
  });

  it("原生 APP 中清除 workbox 缓存（避免旧 bundle 被缓存拦截）", async () => {
    setNative(true);
    const { cleanupServiceWorkerInNative } = await import("../../src/native-sw-cleanup");
    cleanupServiceWorkerInNative();
    await vi.waitFor(() => expect(apis.deleteCache).toHaveBeenCalled());
    expect(apis.deleteCache).toHaveBeenCalledWith("workbox-cache");
    expect(apis.deleteCache).toHaveBeenCalledWith("api-cache");
  });

  it("缺少 serviceWorker / caches API 时不报错", async () => {
    setNative(true);
    delete (navigator as any).serviceWorker;
    delete (globalThis as any).caches;
    const { cleanupServiceWorkerInNative } = await import("../../src/native-sw-cleanup");
    expect(() => cleanupServiceWorkerInNative()).not.toThrow();
  });
});
