import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const javaPath = path.join(
  projectRoot,
  "android",
  "app",
  "src",
  "main",
  "java",
  "com",
  "sock",
  "erp",
  "MainActivity.java",
);

const src = fs.readFileSync(javaPath, "utf8");

describe("MainActivity 原生 Service Worker 清理（修复手机热更新跑旧代码）", () => {
  it("源文件存在", () => {
    expect(fs.existsSync(javaPath)).toBe(true);
  });

  it("递归删除 Service Worker 目录，而不是写死 app_webview/Service Worker 单一路径", () => {
    // 必须使用递归遍历（兼容 app_webview/Service Worker 与 app_webview/Default/Service Worker）
    expect(src).toMatch(/deleteNamedDirectories\s*\(\s*webRoot\s*,\s*"Service Worker"\s*\)/);
    expect(src).toContain("deleteNamedDirectories");
    // 递归方法内部要继续向子目录递归
    expect(src).toMatch(/deleteNamedDirectories\s*\(\s*child\s*,\s*name\s*\)/);
    // 不能再写死不带 Default 的单一路径（旧 bug）
    expect(src).not.toContain('"app_webview/Service Worker"');
  });

  it("同时清理 CacheStorage（workbox precache 所在）", () => {
    expect(src).toMatch(/deleteNamedDirectories\s*\(\s*webRoot\s*,\s*"CacheStorage"\s*\)/);
  });

  it("清理发生在 super.onCreate 之前（WebView 创建前）", () => {
    const purgeIdx = src.indexOf("purgeServiceWorkerStorage(");
    const superIdx = src.indexOf("super.onCreate(savedInstanceState);");
    expect(purgeIdx).toBeGreaterThan(-1);
    expect(superIdx).toBeGreaterThan(-1);
    expect(purgeIdx).toBeLessThan(superIdx);
  });

  it("不再调用 WebStorage.deleteAllData()（该 API 会误删 localStorage 业务数据）", () => {
    expect(src).not.toContain("deleteAllData");
    expect(src).not.toContain("WebStorage");
  });

  it("不删除 Local Storage / IndexedDB（业务数据目录）", () => {
    expect(src).not.toMatch(/"Local Storage"/);
    expect(src).not.toMatch(/"IndexedDB"/);
  });

  it("WebView 创建后用 clearCache(true) 清 HTTP 缓存（不影响 localStorage）", () => {
    expect(src).toContain("clearCache(true)");
  });
});
