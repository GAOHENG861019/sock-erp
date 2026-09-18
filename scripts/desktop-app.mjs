/**
 * 袜厂进销存ERP —— Windows 电脑版启动器
 *
 * 做三件事：
 *  1. 确保本地后台服务（含看门狗）在运行；没运行就自动拉起。
 *  2. 用 Chrome / Edge 的 --app 模式打开“独立应用窗口”（无地址栏、无标签页，像原生软件）。
 *  3. 使用独立的浏览器用户目录，与日常上网的浏览器互不干扰，任务栏单独分组。
 *
 * 由“启动袜厂ERP电脑版.vbs”无黑框调用，也可手动：node scripts/desktop-app.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultDataRootFor } from "./platform.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.MUZI_PORT ?? 4317);
const baseUrl = `http://127.0.0.1:${port}`;
const dataRoot = path.resolve(
  process.env.MUZI_DATA_DIR ?? defaultDataRootFor(process.platform, process.env, os.homedir()),
);

function log(msg) {
  console.log(`[desktop-app] ${msg}`);
}

async function healthStatus() {
  try {
    const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1000) });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.status === "ok" ? json.data : null;
  } catch {
    return null;
  }
}

/** 探测本机可用的 Chromium 内核浏览器（Chrome 优先，Edge 兜底） */
function findBrowser() {
  const candidates = [
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

/** 后台服务没运行时，调用标准启动器（含看门狗），但不让它再开默认浏览器 */
function ensureServer() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(projectRoot, "scripts", "start-app.mjs")], {
      cwd: projectRoot,
      detached: true,
      env: { ...process.env, MUZI_NO_OPEN: "1", MUZI_PORT: String(port) },
      stdio: "ignore",
    });
    child.unref();
    resolve();
  });
}

async function waitForHealthy(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await healthStatus();
    if (status) return status;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

function openAppWindow(browser) {
  // 独立用户数据目录，让 ERP 拥有独立窗口、独立任务栏图标，不与日常浏览器混用
  const userDataDir = path.join(dataRoot, "desktop-profile");
  fs.mkdirSync(userDataDir, { recursive: true });
  const args = [
    `--app=${baseUrl}/`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=1440,900`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=Translate",
  ];
  const child = spawn(browser, args, { detached: true, stdio: "ignore" });
  child.unref();
  log(`已用应用窗口打开：${browser}`);
}

async function main() {
  const browser = findBrowser();
  if (!browser) {
    console.error("未找到 Chrome 或 Edge 浏览器，无法打开电脑版窗口。");
    process.exit(1);
  }

  let status = await healthStatus();
  if (!status) {
    log("后台服务未运行，正在启动…");
    await ensureServer();
    status = await waitForHealthy();
    if (!status) {
      console.error("后台服务启动超时，请确认已运行 npm run build。");
      process.exit(1);
    }
    log("后台服务已就绪。");
  } else {
    log("后台服务已在运行。");
  }

  openAppWindow(browser);
  // 窗口由独立浏览器进程承载，启动器可以立即退出
  setTimeout(() => process.exit(0), 1500);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
