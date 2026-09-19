/**
 * 把原生 APP 专用的 Service Worker「自毁」脚本注入到 Android 内置资源。
 *
 * 必须在 `cap sync android` 之后执行：cap sync 会把 dist 里 workbox 生成的
 * sw.js 复制进 assets/public，本脚本再用 kill switch 覆盖它，从而保证整包
 * 覆盖安装后，旧版本残留的 workbox SW 会被同路径更新的自毁 SW 清除。
 *
 * 注意：浏览器端 PWA 仍使用 dist/sw.js（workbox），本脚本只改 Android 内置资源。
 *
 * 用法：node scripts/inject-native-sw.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(projectRoot, "scripts", "native-kill-sw.js");
const dest = path.join(
  projectRoot,
  "android",
  "app",
  "src",
  "main",
  "assets",
  "public",
  "sw.js",
);

if (!fs.existsSync(src)) {
  console.error(`未找到 kill switch 源文件：${src}`);
  process.exit(1);
}
if (!fs.existsSync(path.dirname(dest))) {
  console.error("Android 资源目录不存在，请先执行 npx cap sync android。");
  process.exit(1);
}
fs.copyFileSync(src, dest);
console.log(`已注入原生自毁 SW：${path.relative(projectRoot, dest)}`);
