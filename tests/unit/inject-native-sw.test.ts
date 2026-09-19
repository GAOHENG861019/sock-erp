import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { processNativeAssets } from "../../scripts/inject-native-sw.mjs";

const projectRoot = process.cwd();
const killSwPath = path.join(projectRoot, "scripts", "native-kill-sw.js");

let tmpDir: string;
let publicDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "inject-sw-"));
  publicDir = path.join(tmpDir, "public");
  fs.mkdirSync(publicDir, { recursive: true });
  // 模拟 cap sync 后 assets/public 里的 workbox 产物
  fs.writeFileSync(
    path.join(publicDir, "sw.js"),
    "// old workbox sw\nimportScripts('workbox-abc.js')",
  );
  fs.writeFileSync(path.join(publicDir, "workbox-abc.js"), "console.log('workbox runtime')");
  fs.writeFileSync(path.join(publicDir, "registerSW.js"), "registerSW({})");
  fs.writeFileSync(path.join(publicDir, "index.html"), "<html>app</html>");
  fs.mkdirSync(path.join(publicDir, "assets"));
  fs.writeFileSync(path.join(publicDir, "assets", "index-xxx.js"), "// app chunk");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("inject-native-sw processNativeAssets（整包 APK 内置资源）", () => {
  it("用自毁 SW 覆盖 workbox sw.js（含 unregister，不再 import workbox）", () => {
    processNativeAssets(publicDir, killSwPath);
    const sw = fs.readFileSync(path.join(publicDir, "sw.js"), "utf8");
    expect(sw).toContain("unregister");
    expect(sw).not.toContain("workbox-abc.js");
  });

  it("移除 workbox 运行库和注册清单，并在返回值中列出", () => {
    const result = processNativeAssets(publicDir, killSwPath);
    expect(fs.existsSync(path.join(publicDir, "workbox-abc.js"))).toBe(false);
    expect(fs.existsSync(path.join(publicDir, "registerSW.js"))).toBe(false);
    expect(result.removed).toContain("workbox-abc.js");
    expect(result.removed).toContain("registerSW.js");
  });

  it("保留应用自身资源（index.html、assets 等）", () => {
    processNativeAssets(publicDir, killSwPath);
    expect(fs.existsSync(path.join(publicDir, "index.html"))).toBe(true);
    expect(fs.existsSync(path.join(publicDir, "assets", "index-xxx.js"))).toBe(true);
  });

  it("资源目录不存在时抛错（不静默失败）", () => {
    expect(() => processNativeAssets(path.join(tmpDir, "missing"), killSwPath)).toThrow();
  });

  it("kill switch 源文件不存在时抛错", () => {
    expect(() => processNativeAssets(publicDir, path.join(tmpDir, "no-sw.js"))).toThrow();
  });
});
