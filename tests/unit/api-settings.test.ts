import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api } from "../../src/api";

function htmlResponse() {
  // 模拟 Capacitor 手机 APP 无后端：静态服务器回退返回 index.html
  return {
    ok: true,
    status: 200,
    headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : "") },
    json: async () => ({}),
  } as unknown as Response;
}

function jsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? "application/json" : "") },
    json: async () => ({ data }),
  } as unknown as Response;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("api.saveSettings 在无后端（手机 APP）下的本地兜底", () => {
  it("后端返回 index.html 时仍把界面偏好写入本地，且不抛错", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(htmlResponse());

    const result = await api.saveSettings({ appearance: "notebook", theme: "dark" });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/settings",
      expect.objectContaining({ method: "PUT" }),
    );
    // 无后端时返回传入值，保证调用方拿到设置
    expect(result).toEqual({ appearance: "notebook", theme: "dark" });
    const stored = JSON.parse(window.localStorage.getItem("sock-erp-ui-preferences") || "{}");
    expect(stored).toEqual({ appearance: "notebook", theme: "dark" });
  });

  it("fetch 网络层失败（离线/无后端）时也写入本地，不向上抛错", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await api.saveSettings({ appearance: "neo" });

    expect(result).toEqual({ appearance: "neo" });
    const stored = JSON.parse(window.localStorage.getItem("sock-erp-ui-preferences") || "{}");
    expect(stored.appearance).toBe("neo");
  });

  it("后端正常时返回后端数据，同时同步写入本地", async () => {
    const backend = { appearance: "neo", theme: "light" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(backend));

    const result = await api.saveSettings({ appearance: "neo" });

    expect(result).toEqual(backend);
    const stored = JSON.parse(window.localStorage.getItem("sock-erp-ui-preferences") || "{}");
    expect(stored.appearance).toBe("neo");
  });

  it("后端返回 HTTP 业务错误时仍向上抛出（不吞掉真实错误）", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => "application/json" },
      json: async () => ({ error: { message: "服务器错误" } }),
    } as unknown as Response);

    await expect(api.saveSettings({ appearance: "neo" })).rejects.toThrow();
  });
});
