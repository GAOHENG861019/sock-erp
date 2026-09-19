/**
 * 原生 APP 热更新 bundle 的 Service Worker 处理。
 *
 * 背景：VitePWA 会在 dist 里生成 workbox 版 sw.js 与 workbox-*.js。浏览器端 PWA 需要它们，
 * 但 Capacitor 原生 APP 内绝不能保留 workbox SW —— 它的 navigateFallback 会拦截导航、
 * 返回缓存的旧 index.html / 旧 chunk，导致 Capgo 热更新切换到新 bundle 后 webview 仍跑旧代码
 * （表现为设置页显示新版本号、但原材料添加等修复始终到不了手机）。
 *
 * 整包 APK 构建时由 scripts/inject-native-sw.mjs 替换内置 sw.js；
 * 热更新 bundle 由本模块在打包 zip 时替换为自毁 SW（scripts/native-kill-sw.js）。
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * 把 JSZip 实例内的 workbox sw.js 替换为原生自毁 SW，并移除 workbox 运行库。
 *
 * @param {import("jszip")} zip 已装入 dist 内容的 JSZip 实例
 * @param {string} projectRoot 项目根目录
 * @returns {{ replaced: boolean; removed: string[]; killSwFound: boolean }}
 */
export function applyNativeServiceWorker(zip, projectRoot) {
  const killSwPath = path.join(projectRoot, "scripts", "native-kill-sw.js");
  const killSwFound = existsSync(killSwPath);
  const removed = [];

  if (killSwFound) {
    zip.file("sw.js", readFileSync(killSwPath));
  }

  // 自毁 SW 不依赖 workbox 运行库，移除 workbox-*.js，避免被旧页面或旧 SW 引用
  for (const name of Object.keys(zip.files)) {
    if (/^workbox-[^/]+\.js$/.test(name)) {
      zip.remove(name);
      removed.push(name);
    }
  }

  return { replaced: killSwFound, removed, killSwFound };
}
