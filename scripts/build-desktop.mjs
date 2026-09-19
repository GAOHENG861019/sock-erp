/**
 * 打包 Windows 电脑版（Electron portable 单文件 exe）
 *
 * 流程：
 *  1. 构建前端 dist + 后端 dist-server
 *  2. 准备自包含运行时目录 release-staging/app-server：
 *     - dist（前端）、dist-server（后端）、database/migrations（迁移）
 *     - runtime/node.exe（便携 Node，避免目标机器安装 Node）
 *     - node_modules（仅生产依赖，better-sqlite3 用已编译的原生二进制）
 *  3. 调用 electron-builder 生成 release/袜厂进销存ERP-电脑版.exe
 *
 * 用法：node scripts/build-desktop.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staging = path.join(projectRoot, "release-staging", "app-server");
const PORTABLE_NODE = path.join(projectRoot, "runtime", "node.exe");

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(" ")}  (cwd: ${opts.cwd ?? projectRoot})`);
  const command = cmd === "npm" && process.platform === "win32" ? "npm.cmd" : cmd;
  // 仅 .cmd / .bat 包装器需要 shell 解析；node.exe 等可执行文件直接 exec，
  // 否则含空格的路径（如沙箱 node.exe）会被 shell 截断
  const needsShell = opts.shell ?? (command.endsWith(".cmd") || command.endsWith(".bat"));
  execFileSync(command, args, {
    cwd: opts.cwd ?? projectRoot,
    stdio: "inherit",
    shell: needsShell,
    env: {
      ...process.env,
      ELECTRON_MIRROR: "https://npmmirror.com/mirrors/electron/",
      ELECTRON_BUILDER_BINARIES_MIRROR: "https://npmmirror.com/mirrors/electron-builder-binaries/",
      CSC_IDENTITY_AUTO_DISCOVERY: "false",
      ...opts.env,
    },
  });
}

function rimraf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// 1. 构建
console.log("=== 1/5 构建前端与后端 ===");
run("npm", ["run", "build"]);

// 2. 准备 staging
console.log("\n=== 2/5 准备自包含运行时目录 ===");
if (!fs.existsSync(PORTABLE_NODE)) {
  console.error("缺少 runtime/node.exe（便携 Node）。请先准备便携 Node 运行时。");
  process.exit(1);
}
rimraf(path.join(projectRoot, "release-staging"));
fs.mkdirSync(staging, { recursive: true });

copyDir(path.join(projectRoot, "dist"), path.join(staging, "dist"));
copyDir(path.join(projectRoot, "dist-server"), path.join(staging, "dist-server"));
copyDir(path.join(projectRoot, "database"), path.join(staging, "database"));
fs.mkdirSync(path.join(staging, "runtime"), { recursive: true });
copyFile(PORTABLE_NODE, path.join(staging, "runtime", "node.exe"));

// 精简 package.json（仅保留生产依赖，避免 electron-builder 误判）
const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const slimPkg = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  private: true,
  type: pkg.type,
  dependencies: pkg.dependencies,
};
fs.writeFileSync(path.join(staging, "package.json"), JSON.stringify(slimPkg, null, 2));

// 3. 安装生产依赖（跳过 postinstall，避免 better-sqlite3 从 GitHub 拉 prebuild 失败回退源码编译）
console.log("\n=== 3/5 安装生产依赖（--ignore-scripts）===");
run("npm", ["install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], {
  cwd: staging,
});

// 4. 用项目内已编译好的 better-sqlite3 覆盖（含原生 .node 二进制）
console.log("\n=== 4/5 放入 better-sqlite3 原生二进制 ===");
rimraf(path.join(staging, "node_modules", "better-sqlite3"));
copyDir(
  path.join(projectRoot, "node_modules", "better-sqlite3"),
  path.join(staging, "node_modules", "better-sqlite3"),
);
const nativeBinary = path.join(
  staging,
  "node_modules",
  "better-sqlite3",
  "build",
  "Release",
  "better_sqlite3.node",
);
if (!fs.existsSync(nativeBinary)) {
  console.error("better-sqlite3 原生二进制缺失，打包中止。");
  process.exit(1);
}
console.log("better-sqlite3 原生二进制已就位。");

// 同步 electron-shell 主进程
fs.copyFileSync(
  path.join(projectRoot, "electron", "main.cjs"),
  path.join(projectRoot, "electron-shell", "main.cjs"),
);
const shellPkg = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "electron-shell", "package.json"), "utf8"),
);
shellPkg.version = pkg.version;
fs.writeFileSync(
  path.join(projectRoot, "electron-shell", "package.json"),
  JSON.stringify(shellPkg, null, 2) + "\n",
);

// 5. electron-builder 打包（配置在 electron-shell 目录，target 以 yml 中的 nsis 为准）
console.log("\n=== 5/5 electron-builder 打包 Windows 安装包 ===");
const shellDir = path.join(projectRoot, "electron-shell");
const builderCli = path.join(projectRoot, "node_modules", "electron-builder", "out", "cli", "cli.js");
run(process.execPath, [builderCli, "--win", "--config", "electron-builder.yml"], { cwd: shellDir });

const artifact = path.join(projectRoot, "release", `SockERP-Desktop-Setup-${pkg.version}.exe`);
if (fs.existsSync(artifact)) {
  const sizeMB = (fs.statSync(artifact).size / 1024 / 1024).toFixed(1);
  console.log(`\n[完成] 电脑版已生成：${artifact}（${sizeMB} MB）`);
} else {
  console.error("\n[失败] 未找到打包产物。");
  process.exit(1);
}
