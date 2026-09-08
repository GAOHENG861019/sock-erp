import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { AppPaths } from "./config.js";
import type { BackupManager, BackupRecord } from "./backup.js";

export type BaiduBackupConfig = {
  enabled: boolean;
  netdiskPath: string;
  lastSyncAt: string | null;
  lastSyncStatus: "idle" | "success" | "error";
  lastSyncError: string | null;
  syncCount: number;
};

const DEFAULT_CONFIG: BaiduBackupConfig = {
  enabled: false,
  netdiskPath: "",
  lastSyncAt: null,
  lastSyncStatus: "idle",
  lastSyncError: null,
  syncCount: 0,
};

/** 常见百度网盘同步目录 */
const COMMON_PATHS = [
  path.join(os.homedir(), "BaiduNetdisk"),
  path.join(os.homedir(), "Documents", "BaiduNetdisk"),
  "D:\\BaiduNetdisk",
  "E:\\BaiduNetdisk",
  "F:\\BaiduNetdisk",
  path.join(os.homedir(), "百度网盘"),
];

export class BaiduBackupManager {
  private configPath: string;

  constructor(
    private readonly paths: AppPaths,
    private readonly backups: BackupManager,
  ) {
    this.configPath = path.join(this.paths.root, "baidu-backup.json");
  }

  getConfig(): BaiduBackupConfig {
    if (!fs.existsSync(this.configPath)) return { ...DEFAULT_CONFIG };
    try {
      const parsed = JSON.parse(fs.readFileSync(this.configPath, "utf8"));
      return { ...DEFAULT_CONFIG, ...parsed };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  updateConfig(input: Partial<BaiduBackupConfig>): BaiduBackupConfig {
    const current = this.getConfig();
    const updated = { ...current, ...input };
    fs.writeFileSync(this.configPath, JSON.stringify(updated, null, 2), "utf8");
    return updated;
  }

  /** 自动检测百度网盘目录 */
  detectNetdiskPath(): string | null {
    for (const p of COMMON_PATHS) {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
        return p;
      }
    }
    return null;
  }

  /** 列出所有检测到的候选路径 */
  listCandidates(): Array<{ path: string; exists: boolean }> {
    return COMMON_PATHS.map((p) => ({ path: p, exists: fs.existsSync(p) }));
  }

  /**
   * 将最新备份同步到百度网盘目录。
   * 同时导出 localStorage 数据为 JSON，一并复制。
   */
  async syncToNetdisk(localStorageData?: Record<string, unknown>): Promise<{ synced: boolean; copiedFiles: string[]; message: string }> {
    const config = this.getConfig();
    if (!config.enabled) {
      return { synced: false, copiedFiles: [], message: "百度网盘备份未启用" };
    }
    if (!config.netdiskPath || !fs.existsSync(config.netdiskPath)) {
      this.updateConfig({ lastSyncStatus: "error", lastSyncError: "百度网盘目录不存在", lastSyncAt: new Date().toISOString() });
      throw new Error("百度网盘目录不存在，请检查路径设置");
    }

    const latest = this.backups.list()[0];
    if (!latest) {
      this.updateConfig({ lastSyncStatus: "error", lastSyncError: "没有可同步的备份", lastSyncAt: new Date().toISOString() });
      throw new Error("没有可同步的备份，请先创建备份");
    }

    const copiedFiles: string[] = [];
    const targetDir = path.join(config.netdiskPath, "sock-erp-backups");
    fs.mkdirSync(targetDir, { recursive: true });

    // 1. 复制 SQLite 备份文件
    const sourceDb = path.join(this.paths.backupsDir, latest.filename);
    if (fs.existsSync(sourceDb)) {
      const targetDb = path.join(targetDir, latest.filename);
      fs.copyFileSync(sourceDb, targetDb);
      copiedFiles.push(latest.filename);
    }

    // 2. 导出 localStorage 数据为 JSON
    if (localStorageData && Object.keys(localStorageData).length > 0) {
      const lsFilename = `localstorage-${latest.filename.replace(".sqlite", "")}.json`;
      const targetLs = path.join(targetDir, lsFilename);
      fs.writeFileSync(targetLs, JSON.stringify(localStorageData, null, 2), "utf8");
      copiedFiles.push(lsFilename);
    }

    // 3. 写入同步清单
    const manifest = {
      syncedAt: new Date().toISOString(),
      sourceBackup: latest.filename,
      sourceCreatedAt: latest.createdAt,
      sourceSize: latest.size,
      files: copiedFiles,
      appVersion: "sock-erp-1.0",
    };
    const manifestPath = path.join(targetDir, "latest-manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    // 清理旧备份（只保留最近10份在网盘目录）
    this.cleanupOldBackups(targetDir);

    this.updateConfig({
      lastSyncAt: new Date().toISOString(),
      lastSyncStatus: "success",
      lastSyncError: null,
      syncCount: config.syncCount + 1,
    });

    return { synced: true, copiedFiles, message: `已同步 ${copiedFiles.length} 个文件到百度网盘` };
  }

  /** 获取网盘目录中的备份列表 */
  listRemoteBackups(): Array<{ filename: string; size: number; createdAt: string }> {
    const config = this.getConfig();
    if (!config.netdiskPath || !fs.existsSync(config.netdiskPath)) return [];
    const targetDir = path.join(config.netdiskPath, "sock-erp-backups");
    if (!fs.existsSync(targetDir)) return [];
    return fs.readdirSync(targetDir)
      .filter((f) => f.endsWith(".sqlite"))
      .map((f) => {
        const stat = fs.statSync(path.join(targetDir, f));
        return { filename: f, size: stat.size, createdAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private cleanupOldBackups(dir: string): void {
    try {
      const files = fs.readdirSync(dir)
        .filter((f) => f.endsWith(".sqlite"))
        .map((f) => ({ file: f, mtime: fs.statSync(path.join(dir, f)).mtime.getTime() }))
        .sort((a, b) => b.mtime - a.mtime);
      for (const old of files.slice(10)) {
        fs.unlinkSync(path.join(dir, old.file));
        const lsFile = old.file.replace(".sqlite", "") + ".json";
        const lsPath = path.join(dir, `localstorage-${lsFile}`);
        if (fs.existsSync(lsPath)) fs.unlinkSync(lsPath);
      }
    } catch {
      // 清理失败不影响同步结果
    }
  }
}
