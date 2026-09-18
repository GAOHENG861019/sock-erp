import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { UpdateManifest } from "../../src/app-update";

// 可在各用例中切换的平台标志
let nativePlatform = false;

const downloadMock = vi.fn();
const nextMock = vi.fn();
const setMock = vi.fn();
const notifyMock = vi.fn();
const currentMock = vi.fn();
const addListenerMock = vi.fn();
const removeListenerMock = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => nativePlatform,
  },
}));

vi.mock("@capgo/capacitor-updater", () => ({
  CapacitorUpdater: {
    download: (...args: unknown[]) => downloadMock(...args),
    next: (...args: unknown[]) => nextMock(...args),
    set: (...args: unknown[]) => setMock(...args),
    notifyAppReady: (...args: unknown[]) => notifyMock(...args),
    current: (...args: unknown[]) => currentMock(...args),
    addListener: (...args: unknown[]) => addListenerMock(...args),
    removeListener: (...args: unknown[]) => removeListenerMock(...args),
  },
}));

async function loadModule() {
  vi.resetModules();
  return await import("../../src/app-update");
}

const validManifest: UpdateManifest = {
  version: "1.0.2",
  url: "https://example.com/bundles/1.0.2.zip",
  status: "success",
  notes: "修复原材料添加",
  releasedAt: "2026-09-18T00:00:00.000Z",
};

beforeEach(() => {
  nativePlatform = false;
  downloadMock.mockReset();
  nextMock.mockReset();
  setMock.mockReset();
  notifyMock.mockReset();
  currentMock.mockReset();
  addListenerMock.mockReset();
  removeListenerMock.mockReset();
  currentMock.mockResolvedValue({
    bundle: { id: "builtin", version: "1.0.0", status: "success" },
    native: "1.0.0",
  });
  downloadMock.mockResolvedValue({
    id: "bundle-102",
    version: "1.0.2",
    status: "success",
  });
  nextMock.mockResolvedValue({});
  setMock.mockResolvedValue(undefined);
  notifyMock.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("compareVersions", () => {
  it("正确比较语义化版本", async () => {
    const { compareVersions } = await loadModule();
    expect(compareVersions("1.0.2", "1.0.1")).toBe(1);
    expect(compareVersions("1.0.1", "1.0.2")).toBe(-1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.2.0", "1.1.9")).toBe(1);
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
  });

  it("容忍 v 前缀、缺位和非数字段", async () => {
    const { compareVersions } = await loadModule();
    expect(compareVersions("v1.0.1", "1.0.0")).toBe(1);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.x", "1.0.0")).toBe(0);
  });
});

describe("checkForUpdates", () => {
  it("网页/电脑端不提示更新", async () => {
    nativePlatform = false;
    const { checkForUpdates } = await loadModule();
    const result = await checkForUpdates();
    expect(result.available).toBe(false);
    expect(result.message).toContain("网页");
  });

  it("服务端有新版本时返回 available", async () => {
    nativePlatform = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => validManifest,
      })),
    );
    const { checkForUpdates } = await loadModule();
    const result = await checkForUpdates();
    expect(result.available).toBe(true);
    expect(result.currentVersion).toBe("1.0.0");
    expect(result.latestVersion).toBe("1.0.2");
    expect(result.manifest?.notes).toBe("修复原材料添加");
  });

  it("版本相同或更低时不提示更新", async () => {
    nativePlatform = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ...validManifest, version: "1.0.0" }),
      })),
    );
    const { checkForUpdates } = await loadModule();
    const result = await checkForUpdates();
    expect(result.available).toBe(false);
    expect(result.message).toBe("已是最新版本");
  });

  it("清单拉取失败时给出可重试提示而不是抛错", async () => {
    nativePlatform = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
    );
    const { checkForUpdates } = await loadModule();
    const result = await checkForUpdates();
    expect(result.available).toBe(false);
    expect(result.latestVersion).toBeNull();
    expect(result.message).toContain("无法连接");
  });

  it("清单格式非法时安全降级", async () => {
    nativePlatform = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ status: "success" }),
      })),
    );
    const { checkForUpdates } = await loadModule();
    const result = await checkForUpdates();
    expect(result.available).toBe(false);
    expect(result.manifest).toBeNull();
  });

  it("原生版本低于 minNativeVersion 时提示重装 APK", async () => {
    nativePlatform = true;
    currentMock.mockResolvedValue({
      bundle: { id: "builtin", version: "1.0.0", status: "success" },
      native: "1.0.0",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ...validManifest, minNativeVersion: "2.0.0" }),
      })),
    );
    const { checkForUpdates } = await loadModule();
    const result = await checkForUpdates();
    expect(result.available).toBe(false);
    expect(result.message).toContain("重新安装");
  });
});

describe("downloadAndInstall", () => {
  it("调用 download 后用 next 标记下次启动生效", async () => {
    nativePlatform = true;
    const { downloadAndInstall } = await loadModule();
    const id = await downloadAndInstall(validManifest);
    expect(downloadMock).toHaveBeenCalledWith({
      url: validManifest.url,
      version: "1.0.2",
    });
    expect(nextMock).toHaveBeenCalledWith({ id: "bundle-102" });
    expect(id).toBe("bundle-102");
  });

  it("非原生环境拒绝下载", async () => {
    nativePlatform = false;
    const { downloadAndInstall } = await loadModule();
    await expect(downloadAndInstall(validManifest)).rejects.toThrow(/不支持/);
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it("提供进度回调时订阅 downloadProgress 并在结束后移除", async () => {
    nativePlatform = true;
    const remove = vi.fn();
    addListenerMock.mockResolvedValue({ remove });
    const { downloadAndInstall } = await loadModule();
    const onProgress = vi.fn();
    await downloadAndInstall(validManifest, onProgress);
    expect(addListenerMock).toHaveBeenCalledWith(
      "download",
      expect.any(Function),
    );
    expect(remove).toHaveBeenCalled();
  });
});

describe("restartWithBundle / notifyAppReady", () => {
  it("restartWithBundle 调用 set 立即切换", async () => {
    nativePlatform = true;
    const { restartWithBundle } = await loadModule();
    await restartWithBundle("bundle-102");
    expect(setMock).toHaveBeenCalledWith({ id: "bundle-102" });
  });

  it("网页端 restartWithBundle 直接返回", async () => {
    nativePlatform = false;
    const { restartWithBundle } = await loadModule();
    await restartWithBundle("bundle-102");
    expect(setMock).not.toHaveBeenCalled();
  });

  it("原生环境启动时调用 notifyAppReady", async () => {
    nativePlatform = true;
    const { notifyAppReady } = await loadModule();
    await notifyAppReady();
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it("网页端不调用 notifyAppReady", async () => {
    nativePlatform = false;
    const { notifyAppReady } = await loadModule();
    await notifyAppReady();
    expect(notifyMock).not.toHaveBeenCalled();
  });
});
