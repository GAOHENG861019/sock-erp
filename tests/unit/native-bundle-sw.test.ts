import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import path from "node:path";
import { applyNativeServiceWorker } from "../../scripts/lib/native-bundle.mjs";

const projectRoot = process.cwd();

describe("applyNativeServiceWorker（热更新 bundle 的 SW 处理）", () => {
  it("用自毁 SW 替换 workbox sw.js 并移除 workbox 运行库", async () => {
    const zip = new JSZip();
    // 模拟 vite build 后 dist 里的内容
    zip.file("sw.js", "// workbox generated SW: precacheAndRoute + navigateFallback");
    zip.file("workbox-f641ca17.js", "// workbox runtime library");
    zip.file("index.html", "<html></html>");
    zip.file("assets/index-abc.js", "// app chunk");
    zip.file("assets/FitnessPage-xyz.js", "// lazy chunk");

    const result = applyNativeServiceWorker(zip, projectRoot);

    expect(result.killSwFound).toBe(true);
    expect(result.replaced).toBe(true);
    expect(result.removed).toContain("workbox-f641ca17.js");

    const swContent = await zip.file("sw.js")!.async("string");
    // 自毁 SW 特征
    expect(swContent).toContain("skipWaiting");
    expect(swContent).toContain("unregister");
    expect(swContent).toContain("caches");
    // 不包含 workbox 的实际缓存/拦截逻辑（注释里提及 workbox 无妨）
    expect(swContent).not.toContain("navigateFallback");
    expect(swContent).not.toContain("precacheAndRoute");
    expect(swContent).not.toContain("importScripts");

    // workbox 运行库被移除
    expect(zip.file("workbox-f641ca17.js")).toBeNull();
    // 业务文件全部保留
    expect(zip.file("index.html")).not.toBeNull();
    expect(zip.file("assets/index-abc.js")).not.toBeNull();
    expect(zip.file("assets/FitnessPage-xyz.js")).not.toBeNull();
  });

  it("自毁 SW 不注册 fetch handler（绝不拦截任何请求）", async () => {
    const zip = new JSZip();
    zip.file("sw.js", "workbox SW with fetch handler");
    applyNativeServiceWorker(zip, projectRoot);
    const swContent = await zip.file("sw.js")!.async("string");
    expect(swContent).not.toMatch(/addEventListener\(\s*["']fetch["']/);
  });

  it("自毁 SW 会清空缓存并 reload 所有客户端（让新 bundle 干净加载）", async () => {
    const zip = new JSZip();
    zip.file("sw.js", "workbox");
    applyNativeServiceWorker(zip, projectRoot);
    const swContent = await zip.file("sw.js")!.async("string");
    expect(swContent).toMatch(/caches\.keys\(\)/);
    expect(swContent).toMatch(/clients\.matchAll/);
    expect(swContent).toMatch(/client\.navigate/);
  });

  it("scripts/native-kill-sw.js 真实存在", () => {
    const fs = require("node:fs");
    const killPath = path.join(projectRoot, "scripts", "native-kill-sw.js");
    expect(fs.existsSync(killPath)).toBe(true);
  });
});
