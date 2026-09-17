/**
 * 袜厂进销存ERP 后台服务看门狗
 *
 * 作用：持续监控本地 HTTP 服务，电脑长时间空闲、休眠唤醒或数据库偶发锁死
 * 导致服务“进程还在但不响应”时，自动重启服务，无需人工干预。
 *
 * 由 start-app.mjs 以 detached 方式启动；看门狗自身只保留一个实例，
 * 并直接管理服务子进程（非 detached），服务异常退出也会被重新拉起。
 */
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultDataRootFor } from "./platform.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.MUZI_PORT ?? 4317);
const baseUrl = `http://127.0.0.1:${port}`;
const dataRoot = path.resolve(process.env.MUZI_DATA_DIR ?? defaultDataRootFor(process.platform, process.env, os.homedir()));
const logsDir = path.join(dataRoot, "logs");
const watchdogPidFile = path.join(dataRoot, "muzi-workspace.watchdog.pid");
const serverPidFile = path.join(dataRoot, "muzi-workspace.pid");
const startLockFile = path.join(dataRoot, "muzi-workspace.starting");
const serverFile = path.join(projectRoot, "dist-server", "server", "index.js");

const HEALTH_INTERVAL_MS = Number(process.env.MUZI_WD_INTERVAL_MS ?? 30_000); // 每 30 秒探活一次
const HEALTH_TIMEOUT_MS = Number(process.env.MUZI_WD_TIMEOUT_MS ?? 3_000); // 单次健康检查 3 秒超时
const MAX_FAILURES = Number(process.env.MUZI_WD_MAX_FAILURES ?? 3); // 连续 3 次失败（约 90 秒）判定为挂起
const PROCESS_CHECK_INTERVAL_MS = Number(process.env.MUZI_WD_PROC_INTERVAL_MS ?? 15_000); // 进程存活检测间隔
const RESTART_WINDOW_MS = 10 * 60_000; // 10 分钟滚动窗口
const MAX_RESTARTS_IN_WINDOW = 6; // 窗口内最多重启 6 次，避免无限循环

fs.mkdirSync(logsDir, { recursive: true });

function log(message) {
  const line = `[watchdog ${new Date().toISOString()}] ${message}`;
  console.log(line);
  try {
    fs.appendFileSync(path.join(logsDir, "watchdog.log"), `${line}\n`);
  } catch {
    /* 日志写失败不影响监控 */
  }
}

// ===== 单实例锁：避免多个看门狗同时管理 =====
function acquireWatchdogLock() {
  try {
    const existing = JSON.parse(fs.readFileSync(watchdogPidFile, "utf8"));
    if (existing.pid && processExists(existing.pid) && Number(existing.pid) !== process.pid) {
      log(`看门狗已在运行（PID ${existing.pid}），本次退出。`);
      process.exit(0);
    }
  } catch {
    // 没有有效记录，继续
  }
  fs.writeFileSync(watchdogPidFile, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), "utf8");
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function healthStatus() {
  try {
    const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (!response.ok) return null;
    const data = (await response.json()).data;
    return data?.status === "ok" ? data : null;
  } catch {
    return null;
  }
}

let serverChild = null;
let failures = 0;
let isStarting = false; // 启动/重启互斥锁，防止多个定时器并发拉起多个实例
let watchdogStartedServer = false; // 服务是否由看门狗启动（决定进程退出时是否自动拉起）
const restartHistory = [];

function startServer() {
  const instanceId = randomUUID();
  const buildId = currentBuildId();
  const logFile = path.join(logsDir, "app.log");
  const logDescriptor = fs.openSync(logFile, "a");

  // 直接以子进程方式启动（不 detached），看门狗可以直接观察并控制它
  serverChild = spawn(process.execPath, [serverFile], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      MUZI_PORT: String(port),
      MUZI_DATA_DIR: dataRoot,
      MUZI_BUILD_ID: buildId ?? "watchdog",
      MUZI_INSTANCE_ID: instanceId,
    },
    stdio: ["ignore", logDescriptor, logDescriptor],
  });
  fs.closeSync(logDescriptor);
  watchdogStartedServer = true;

  fs.writeFileSync(
    serverPidFile,
    JSON.stringify({ pid: serverChild.pid, projectRoot, buildId, instanceId, startedAt: new Date().toISOString(), watchdogPid: process.pid }, null, 2),
    "utf8",
  );

  const child = serverChild;
  log(`已启动服务子进程 PID=${child.pid} instance=${instanceId}`);

  child.on("exit", (code, signal) => {
    // 只有当前管理的这个进程退出才清空引用，旧实例的退出事件忽略
    if (serverChild === child) {
      log(`服务子进程退出 code=${code} signal=${signal}`);
      serverChild = null;
    }
  });

  return instanceId;
}

/**
 * 统一的服务拉起/重启入口（带互斥锁）。
 * 健康检查定时器与进程检测定时器都调用它，避免并发启动多个实例。
 */
async function ensureServer(reason) {
  if (shuttingDown || isStarting) return;
  // 先探活：如果服务其实已经健康，就不必重启
  const healthy = await healthStatus();
  if (healthy) {
    failures = 0;
    return;
  }
  isStarting = true;
  try {
    if (serverChild) {
      // 进程还在但不响应（挂起），需要重启
      log(`准备重启服务，原因：${reason}`);
      if (!canRestart()) return;
      stopServer();
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      try {
        if (fs.existsSync(startLockFile)) fs.unlinkSync(startLockFile);
      } catch {
        /* ignore */
      }
    } else {
      // 进程已退出，直接拉起
      log(`服务进程不存在，自动拉起（原因：${reason}）`);
      if (!canRestart()) return;
    }
    const instanceId = startServer();
    const ok = await waitForHealthy(instanceId, 30_000);
    if (ok) {
      log("服务已启动并恢复健康。");
      failures = 0;
    } else {
      log("服务启动后 30 秒内仍未恢复健康。");
    }
  } finally {
    isStarting = false;
  }
}

function currentBuildId() {
  try {
    const webFile = path.join(projectRoot, "dist", "index.html");
    const server = fs.statSync(serverFile);
    const web = fs.statSync(webFile);
    return `${server.size}-${Math.trunc(server.mtimeMs)}:${web.size}-${Math.trunc(web.mtimeMs)}`;
  } catch {
    return null;
  }
}

async function waitForHealthy(instanceId, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await healthStatus();
    if (status && (!instanceId || status.instanceId === instanceId || status.application === "muzi-workspace")) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

/**
 * 停止服务子进程。
 * Windows 用 taskkill /t /f 强制结束进程树；
 * 其他平台先 SIGTERM 优雅退出，等待 2 秒后仍存活则 SIGKILL 强制结束
 * （服务挂起、事件循环阻塞时 SIGTERM 可能无法被处理）。
 */
function stopServerSync() {
  if (!serverChild) return;
  const pid = serverChild.pid;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
    } else {
      try {
        process.kill(pid, "SIGTERM");
      } catch (error) {
        if (error?.code !== "ESRCH") throw error;
      }
    }
  } catch (error) {
    log(`停止服务时出错：${error.message}`);
  }
  serverChild = null;
}

async function stopServer() {
  if (!serverChild) return;
  const pid = serverChild.pid;
  stopServerSync();
  if (process.platform !== "win32") {
    // 等待优雅退出，最多 2 秒
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline && isPidAlive(pid)) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    // 仍然存活（挂起/暂停），强制结束
    if (isPidAlive(pid)) {
      log(`服务进程 ${pid} 未响应 SIGTERM，强制结束。`);
      try {
        process.kill(pid, "SIGKILL");
      } catch (error) {
        if (error?.code !== "ESRCH") log(`强制结束出错：${error.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

function canRestart() {
  const now = Date.now();
  while (restartHistory.length && now - restartHistory[0] > RESTART_WINDOW_MS) restartHistory.shift();
  if (restartHistory.length >= MAX_RESTARTS_IN_WINDOW) {
    log(`滚动窗口内重启次数已达上限 ${MAX_RESTARTS_IN_WINDOW}，停止自动重启，请人工检查。`);
    return false;
  }
  restartHistory.push(now);
  return true;
}

async function main() {
  acquireWatchdogLock();

  const cleanup = () => {
    log("看门狗退出，停止服务子进程。");
    shuttingDown = true;
    stopServerSync();
    try {
      if (fs.existsSync(watchdogPidFile)) fs.unlinkSync(watchdogPidFile);
    } catch {
      /* ignore */
    }
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("uncaughtException", (error) => log(`看门狗自身异常（已忽略）：${error.message}`));

  // 如果服务已经在运行（比如 start-app 刚启动），先观察；否则自己启动
  const initial = await healthStatus();
  if (!initial) {
    log("未检测到健康服务，由看门狗启动。");
    await ensureServer("首次启动");
  } else {
    log(`检测到服务已在运行（build=${initial.buildId}），开始监控。`);
  }

  // 健康检查定时器：连续失败说明服务挂起（进程还在但不响应），触发重启。
  // 注意：核心监控定时器不能 unref，否则服务子进程退出后事件循环没有
  // ref 句柄，看门狗自身也会跟着退出。
  setInterval(() => {
    healthStatus().then((status) => {
      if (status) {
        if (failures > 0) log("服务恢复健康。");
        failures = 0;
      } else {
        failures += 1;
        log(`健康检查失败 ${failures}/${MAX_FAILURES}`);
        if (failures >= MAX_FAILURES) {
          failures = 0;
          void ensureServer("连续健康检查失败（服务挂起）");
        }
      }
    });
  }, HEALTH_INTERVAL_MS);

  // 进程存活检测定时器：服务进程意外退出（崩溃/被杀死）时立即拉起。
  // 仅处理看门狗自己启动的服务；start-app 启动的外部服务由健康检查兜底。
  setInterval(() => {
    if (!serverChild && watchdogStartedServer && !shuttingDown && !isStarting) {
      void ensureServer("服务进程意外退出");
    }
  }, PROCESS_CHECK_INTERVAL_MS).unref?.();
}

let shuttingDown = false;
process.on("exit", () => {
  shuttingDown = true;
});

main().catch((error) => {
  log(`看门狗启动失败：${error.message}`);
  process.exit(1);
});
