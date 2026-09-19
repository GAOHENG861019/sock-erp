/**
 * 把原生 APP 专用的 Service Worker「自毁」脚本注入到 Android 内置资源，
 * 并移除 VitePWA 生成的 workbox 运行库。
 *
 * 必须在 `cap sync android` 之后执行：cap sync 会把 dist 里 workbox 生成的
 * sw.js 与 workbox-*.js 复制进 assets/public，本脚本再用 kill switch 覆盖
 * sw.js，并删除 workbox-*.js，从而保证：
 *  - 整包覆盖安装后，旧版本残留的 workbox SW 会被同路径更新的自毁 SW 清除；
 *  - 内置资源里不存在任何 workbox 运行库，自毁 SW 也不会引用它。
 *
 * 注意：浏览器端 PWA 仍使用 dist/sw.js（workbox），本脚本只改 Android 内置资源。
 *
 * 用法：node scripts/inject-native-sw.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 处理 Android 内置 web 资源目录：用自毁 SW 覆盖 sw.js，并移除 workbox 运行库。
 * 抽成独立函数以便单元测试（可传入任意目录）。
 *
 * @param {string} publicDir Android assets/public 目录绝对路径
 * @param {string} killSwPath 自毁 SW 源文件绝对路径
 * @returns {{ replaced: boolean, removed: string[] }}
 */
export function processNativeAssets(publicDir, killSwPath) {
  if (!fs.existsSync(killSwPath)) {
    throw new Error(`未找到 kill switch 源文件：${killSwPath}`);
  }
  if (!fs.existsSync(publicDir)) {
    throw new Error(`Android 资源目录不存在，请先执行 npx cap sync android：${publicDir}`);
  }

  // 1) 用自毁 SW 覆盖 workbox sw.js
  fs.copyFileSync(killSwPath, path.join(publicDir, "sw.js"));

  // 2) 移除 workbox 运行库（自毁 SW 不引用，删除后可彻底避免旧 SW 加载它）
  const removed = [];
  for (const entry of fs.readdirSync(publicDir)) {
    if (/^workbox-.*\.js$/.test(entry)) {
      fs.rmSync(path.join(publicDir, entry));
      removed.push(entry);
    }
  }
  // 原生 APP 不注册 PWA SW，若存在注册清单也一并移除（可能被旧逻辑调用）。
  for (const candidate of ["registerSW.js", "sw-register.js"]) {
    const p = path.join(publicDir, candidate);
    if (fs.existsSync(p)) {
      fs.rmSync(p);
      removed.push(candidate);
    }
  }
  return { replaced: true, removed };
}

// 仅在作为脚本直接运行时执行真实注入
const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const killSwPath = path.join(projectRoot, "scripts", "native-kill-sw.js");
  const publicDir = path.join(
    projectRoot,
    "android",
    "app",
    "src",
    "main",
    "assets",
    "public",
  );
  const result = processNativeAssets(publicDir, killSwPath);
  console.log(`已注入原生自毁 SW：${path.relative(projectRoot, path.join(publicDir, "sw.js"))}`);
  if (result.removed.length > 0) {
    console.log(`已从内置资源移除：${result.removed.join(", ")}`);
  } else {
    console.log("内置资源中未发现 workbox 运行库。");
  }
}
