import fs from "node:fs";
import path from "node:path";
import { buildApp } from "./app.js";
import { APP_HOST, APP_PORT, getAppPaths } from "./config.js";

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "正在安全关闭袜厂进销存ERP管理系统");
  try {
    await app.close();
  } finally {
    removeOwnPidFile();
    process.exit(0);
  }
}

const app = await buildApp({
  logger: true,
  serveStatic: process.env.NODE_ENV === "production",
  requestShutdown: (reason) => void shutdown(reason),
});

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

// ===== 进程级容错：避免未捕获异常直接让后台服务挂死 =====
// 内部应用以“保活”为优先：记录错误后继续运行，而不是留下一个无响应的进程。
process.on("uncaughtException", (error) => {
  app.log.error({ error: { message: error.message, stack: error.stack } }, "捕获到未处理异常，服务继续运行");
});
process.on("unhandledRejection", (reason) => {
  app.log.error({ reason: reason instanceof Error ? { message: reason.message, stack: reason.stack } : reason }, "捕获到未处理的 Promise 拒绝");
});

try {
  await app.listen({ host: APP_HOST, port: APP_PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

// ===== HTTP 连接超时配置 =====
// 长时间空闲后浏览器/手机与服务的连接可能被系统或网络设备静默断开，
// 明确保活与超时参数，避免出现“进程还在但请求永远挂起”的情况。
const httpServer = app.server;
httpServer.keepAliveTimeout = 75_000; // 空闲连接保留 75 秒，主动在大多数 NAT 超时前关闭
httpServer.headersTimeout = 80_000; // 必须大于 keepAliveTimeout
httpServer.requestTimeout = 300_000; // 单个请求最长 5 分钟（上传/备份不受影响）
httpServer.maxRequestsPerSocket = 0; // 不限制单个连接的请求数（保持长连接复用）

// ===== 内部自检：定期走一遍健康检查，及时发现数据库/事件循环异常 =====
const SELF_CHECK_INTERVAL_MS = 60_000;
const SELF_CHECK_TIMEOUT_MS = 10_000;
let consecutiveFailures = 0;
const selfCheckTimer = setInterval(() => {
  if (shuttingDown) return;
  const startedAt = Date.now();
  Promise.race([
    app.inject({ method: "GET", url: "/api/health" }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("自检超时")), SELF_CHECK_TIMEOUT_MS)),
  ])
    .then((response) => {
      if (response.statusCode !== 200) throw new Error(`健康检查返回 ${response.statusCode}`);
      const elapsed = Date.now() - startedAt;
      if (consecutiveFailures > 0) app.log.info("自检恢复正常");
      consecutiveFailures = 0;
      if (elapsed > 3_000) app.log.warn({ elapsed }, "自检响应较慢，事件循环可能繁忙");
    })
    .catch((error) => {
      consecutiveFailures += 1;
      app.log.error({ error: error.message, consecutiveFailures }, "服务自检失败");
      // 连续 3 次自检失败（约 3 分钟），说明服务已实质挂起，主动退出交由看门狗重启
      if (consecutiveFailures >= 3) {
        app.log.error("连续多次自检失败，主动退出以便看门狗重启");
        void shutdown("self-check-failed");
      }
    });
}, SELF_CHECK_INTERVAL_MS);
selfCheckTimer.unref?.();

function removeOwnPidFile() {
  const pidFile = path.join(getAppPaths().root, "muzi-workspace.pid");
  try {
    const record = JSON.parse(fs.readFileSync(pidFile, "utf8")) as { pid?: unknown };
    if (Number(record.pid) === process.pid) fs.unlinkSync(pidFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") app.log.warn(error, "无法清理启动记录");
  }
}
