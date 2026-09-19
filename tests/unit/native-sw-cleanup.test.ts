import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// 安装/卸载假的 serviceWorker 与 caches API
function installBrowserApis(options: { controlled?: boolean; registrations?: number } = {}) {
  const regs = Array.from({ length: options.registrations ?? 1 }, () => ({
    unregister: vi.fn(async () => true),
  }));
  const unregister = regs[0]?.unregister ?? vi.fn(async () => true);
  const getRegistrations = vi.fn(async () => regs);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistrations,
      controller: options.controlled ? { scriptURL: "/sw.js" } : null,
    },
  });

  const deleteCache = vi.fn(async () => true);
  const cacheKeys = vi.fn(async () => ["workbox-cache", "api-cache"]);
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: { keys: cacheKeys, delete: deleteCache },
  });

  return { unregister, getRegistrations, deleteCache, cacheKeys, regs };
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
  let reloadSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    apis = installBrowserApis();
    setNative(false);
    sessionStorage.clear();
    reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    });
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
    expect(reloadSpy).not.toHaveBeenCalled();
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

  it("原生 APP 中页面被旧 SW 控制时，清理后 reload 一次以加载最新 bundle", async () => {
    const controlled = installBrowserApis({ controlled: true });
    setNative(true);
    const { cleanupServiceWorkerInNative } = await import("../../src/native-sw-cleanup");
    cleanupServiceWorkerInNative();
    await vi.waitFor(() => expect(controlled.unregister).toHaveBeenCalled());
    await vi.waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1));
  });

  it("存在残留 SW 注册（即使未控制页面）时也 reload 一次", async () => {
    const withReg = installBrowserApis({ controlled: false, registrations: 1 });
    setNative(true);
    const { cleanupServiceWorkerInNative } = await import("../../src/native-sw-cleanup");
    cleanupServiceWorkerInNative();
    await vi.waitFor(() => expect(withReg.unregister).toHaveBeenCalled());
    await vi.waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1));
  });

  it("没有任何 SW 时不 reload（避免每次启动都刷新）", async () => {
    installBrowserApis({ controlled: false, registrations: 0 });
    setNative(true);
    const { cleanupServiceWorkerInNative } = await import("../../src/native-sw-cleanup");
    cleanupServiceWorkerInNative();
    // 等待内部 Promise 完成
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it("sessionStorage 已标记时不重复 reload（防止无限刷新）", async () => {
    installBrowserApis({ controlled: true });
    sessionStorage.setItem("sock-erp-sw-reloaded", "1");
    setNative(true);
    const { cleanupServiceWorkerInNative } = await import("../../src/native-sw-cleanup");
    cleanupServiceWorkerInNative();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it("缺少 serviceWorker / caches API 时不报错", async () => {
    setNative(true);
    delete (navigator as any).serviceWorker;
    delete (globalThis as any).caches;
    const { cleanupServiceWorkerInNative } = await import("../../src/native-sw-cleanup");
    expect(() => cleanupServiceWorkerInNative()).not.toThrow();
  });
});
