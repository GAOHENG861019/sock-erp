// 袜厂进销存ERP —— Electron 电脑版主进程
// 职责：启动本地后端（便携 Node），等待健康后创建应用窗口；退出时清理后端。
// 后端用便携 node.exe 运行，避免 better-sqlite3 原生模块为 Electron ABI 重编译。
const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const { spawn, execFileSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");

const PORT = Number(process.env.MUZI_PORT || 4317);
const BASE_URL = `http://127.0.0.1:${PORT}`;

let serverProcess = null;
let mainWindow = null;
let quitting = false;

// 后端资源根目录：打包后在 resources/app-server，开发时为项目根。
function serverRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app-server");
  }
  return path.join(__dirname, "..");
}

function dataDir() {
  if (app.isPackaged) {
    return path.join(app.getPath("userData"), "MuziWorkspace");
  }
  return path.join(process.env.LOCALAPPDATA || app.getPath("appData"), "MuziWorkspace");
}

// 探测端口是否已有服务在监听（避免重复启动）
function portInUse(port) {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once("error", () => resolve(true))
      .once("listening", () => tester.close(() => resolve(false)))
      .listen(port, "127.0.0.1");
  });
}

async function healthOk() {
  try {
    const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(1000) });
    if (!res.ok) return false;
    const json = await res.json();
    return json?.data?.status === "ok";
  } catch {
    return false;
  }
}

function startBackend() {
  const root = serverRoot();
  const serverFile = path.join(root, "dist-server", "server", "index.js");
  // 打包后用随包携带的便携 node；开发时回退到当前 electron（以纯 node 模式运行）。
  const portableNode = path.join(root, "runtime", "node.exe");
  const usePortable = fs.existsSync(portableNode);

  const dataRoot = dataDir();
  fs.mkdirSync(dataRoot, { recursive: true });

  const env = {
    ...process.env,
    NODE_ENV: "production",
    MUZI_PORT: String(PORT),
    MUZI_DATA_DIR: dataRoot,
    // 电脑版只监听本机回环，避免便携 node 监听 0.0.0.0 触发 Windows 防火墙弹窗。
    // 手机局域网访问请使用“便携版”桌面快捷方式（监听 0.0.0.0）；跨设备数据走 Supabase 云同步。
    MUZI_HOST: "127.0.0.1",
    HOST: "127.0.0.1",
  };

  if (usePortable) {
    serverProcess = spawn(portableNode, [serverFile], {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } else {
    // 开发环境：electron.exe 以纯 Node 模式运行
    env.ELECTRON_RUN_AS_NODE = "1";
    serverProcess = spawn(process.execPath, [serverFile], {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  serverProcess.stdout?.on("data", (d) => console.log(`[server] ${d}`.trimEnd()));
  serverProcess.stderr?.on("data", (d) => console.error(`[server] ${d}`.trimEnd()));
  serverProcess.on("exit", (code) => {
    console.log(`后端进程退出 code=${code}`);
    if (!quitting && app.isPackaged) {
      // 后端意外退出，2 秒后退出应用，由用户重新打开
      dialog.showErrorBox("袜厂进销存ERP", "本地服务已停止，请重新打开应用。");
      app.quit();
    }
  });
}

async function waitForHealthy(timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await healthOk()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// 确保桌面和开始菜单快捷方式存在（NSIS 静默安装可能不创建，改为应用首次启动时自建）。
// 每次启动检查一次，缺失才创建，避免重复弹 PowerShell；快捷方式被误删后下次启动也会恢复。
function ensureShortcuts() {
  if (!app.isPackaged) return;
  try {
    const exePath = app.getPath("exe");
    const workDir = path.dirname(exePath);
    const shortcutName = "袜厂进销存ERP.lnk";
    const desktopLink = path.join(app.getPath("desktop"), shortcutName);
    const startMenuDir = path.join(
      app.getPath("appData"),
      "Microsoft",
      "Windows",
      "Start Menu",
      "Programs",
      "袜厂进销存ERP"
    );
    const startMenuLink = path.join(startMenuDir, shortcutName);

    const needDesktop = !fs.existsSync(desktopLink);
    const needStartMenu = !fs.existsSync(startMenuLink);
    if (!needDesktop && !needStartMenu) return;

    // 通过 PowerShell + WScript.Shell 创建标准 .lnk（无需任何第三方依赖）
    const ps = [
      "$ErrorActionPreference='Stop'",
      `$exe=${JSON.stringify(exePath)}`,
      `$wd=${JSON.stringify(workDir)}`,
      `$desktop=${JSON.stringify(desktopLink)}`,
      `$smDir=${JSON.stringify(startMenuDir)}`,
      `$sm=${JSON.stringify(startMenuLink)}`,
      "$ws=New-Object -ComObject WScript.Shell",
      "if(-not (Test-Path $desktop)){",
      "  $s=$ws.CreateShortcut($desktop); $s.TargetPath=$exe; $s.WorkingDirectory=$wd;",
      "  $s.IconLocation=\"$exe,0\"; $s.Description='袜厂进销存ERP管理系统'; $s.Save()",
      "}",
      "if(-not (Test-Path $sm)){",
      "  New-Item -ItemType Directory -Force -Path $smDir | Out-Null",
      "  $s=$ws.CreateShortcut($sm); $s.TargetPath=$exe; $s.WorkingDirectory=$wd;",
      "  $s.IconLocation=\"$exe,0\"; $s.Description='袜厂进销存ERP管理系统'; $s.Save()",
      "}",
    ].join(";");
    execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps],
      { windowsHide: true, timeout: 15000 }
    );
    console.log("[shortcut] 已确保桌面/开始菜单快捷方式存在");
  } catch (e) {
    // 快捷方式创建失败不影响应用正常使用
    console.warn("[shortcut] 创建快捷方式失败:", e?.message || e);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "袜厂进销存ERP",
    backgroundColor: "#1a1a2e",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "icon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadURL(`${BASE_URL}/`);

  // 外部链接交给系统浏览器，应用内链接留在窗口
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    if (!(await healthOk())) {
      if (!(await portInUse(PORT))) {
        startBackend();
      }
      const ok = await waitForHealthy();
      if (!ok) {
        dialog.showErrorBox("袜厂进销存ERP", "本地服务启动超时，请重新打开应用。");
        app.quit();
        return;
      }
    }
    createWindow();
    ensureShortcuts();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("before-quit", () => {
    quitting = true;
  });

  app.on("window-all-closed", () => {
    if (serverProcess) {
      try {
        serverProcess.kill();
      } catch {
        /* ignore */
      }
      serverProcess = null;
    }
    app.quit();
  });
}
