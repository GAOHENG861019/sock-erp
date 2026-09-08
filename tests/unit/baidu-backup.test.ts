import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { BaiduBackupManager } from "../../server/baiduBackup";

// 创建临时目录
function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "baidu-backup-test-"));
}

// Mock BackupManager
function makeMockBackupManager(backupsDir: string) {
  const backupFile = path.join(backupsDir, "manual-2024-01-01-test.sqlite");
  fs.writeFileSync(backupFile, "fake sqlite data");
  return {
    list: () => [{
      id: "test-backup-1",
      filename: "manual-2024-01-01-test.sqlite",
      createdAt: "2024-01-01T10:00:00.000Z",
      size: fs.statSync(backupFile).size,
      type: "manual" as const,
      label: "测试备份",
      keep: false,
    }],
  };
}

function makePaths(root: string) {
  const backupsDir = path.join(root, "backups");
  fs.mkdirSync(backupsDir, { recursive: true });
  return {
    root,
    dataFile: path.join(root, "data", "app.sqlite"),
    backupsDir,
    exportsDir: path.join(root, "exports"),
    logsDir: path.join(root, "logs"),
    backupIndex: path.join(backupsDir, "index.json"),
  };
}

let tempRoot: string;
let netdiskDir: string;

beforeEach(() => {
  tempRoot = makeTempDir();
  netdiskDir = path.join(tempRoot, "BaiduNetdisk");
  fs.mkdirSync(netdiskDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("BaiduBackupManager", () => {
  it("默认配置为未启用", () => {
    const paths = makePaths(tempRoot);
    const mockBackups = makeMockBackupManager(paths.backupsDir);
    const manager = new BaiduBackupManager(paths, mockBackups as any);
    const config = manager.getConfig();
    expect(config.enabled).toBe(false);
    expect(config.netdiskPath).toBe("");
    expect(config.lastSyncStatus).toBe("idle");
  });

  it("更新配置并持久化", () => {
    const paths = makePaths(tempRoot);
    const mockBackups = makeMockBackupManager(paths.backupsDir);
    const manager = new BaiduBackupManager(paths, mockBackups as any);

    manager.updateConfig({ enabled: true, netdiskPath: netdiskDir });
    const config = manager.getConfig();
    expect(config.enabled).toBe(true);
    expect(config.netdiskPath).toBe(netdiskDir);

    // 配置文件已写入
    expect(fs.existsSync(path.join(tempRoot, "baidu-backup.json"))).toBe(true);
  });

  it("未启用时同步返回 synced=false", async () => {
    const paths = makePaths(tempRoot);
    const mockBackups = makeMockBackupManager(paths.backupsDir);
    const manager = new BaiduBackupManager(paths, mockBackups as any);

    const result = await manager.syncToNetdisk();
    expect(result.synced).toBe(false);
    expect(result.copiedFiles).toHaveLength(0);
  });

  it("启用后同步备份文件到网盘目录", async () => {
    const paths = makePaths(tempRoot);
    const mockBackups = makeMockBackupManager(paths.backupsDir);
    const manager = new BaiduBackupManager(paths, mockBackups as any);

    manager.updateConfig({ enabled: true, netdiskPath: netdiskDir });
    const result = await manager.syncToNetdisk({ "sock-erp-test": "data" });

    expect(result.synced).toBe(true);
    expect(result.copiedFiles.length).toBeGreaterThanOrEqual(1);

    // 检查目标目录
    const targetDir = path.join(netdiskDir, "sock-erp-backups");
    expect(fs.existsSync(targetDir)).toBe(true);
    const files = fs.readdirSync(targetDir);
    expect(files).toContain("manual-2024-01-01-test.sqlite");
    expect(files).toContain("latest-manifest.json");
  });

  it("同步 localStorage 数据为 JSON 文件", async () => {
    const paths = makePaths(tempRoot);
    const mockBackups = makeMockBackupManager(paths.backupsDir);
    const manager = new BaiduBackupManager(paths, mockBackups as any);

    manager.updateConfig({ enabled: true, netdiskPath: netdiskDir });
    const lsData = { "sock-erp-fanwa": JSON.stringify([{ name: "test" }]) };
    await manager.syncToNetdisk(lsData);

    const targetDir = path.join(netdiskDir, "sock-erp-backups");
    const lsFiles = fs.readdirSync(targetDir).filter((f) => f.startsWith("localstorage-"));
    expect(lsFiles.length).toBe(1);

    const content = JSON.parse(fs.readFileSync(path.join(targetDir, lsFiles[0]), "utf8"));
    expect(content["sock-erp-fanwa"]).toBe(JSON.stringify([{ name: "test" }]));
  });

  it("同步成功后更新状态", async () => {
    const paths = makePaths(tempRoot);
    const mockBackups = makeMockBackupManager(paths.backupsDir);
    const manager = new BaiduBackupManager(paths, mockBackups as any);

    manager.updateConfig({ enabled: true, netdiskPath: netdiskDir });
    await manager.syncToNetdisk();

    const config = manager.getConfig();
    expect(config.lastSyncStatus).toBe("success");
    expect(config.lastSyncAt).not.toBeNull();
    expect(config.syncCount).toBe(1);
  });

  it("网盘目录不存在时同步失败并记录错误", async () => {
    const paths = makePaths(tempRoot);
    const mockBackups = makeMockBackupManager(paths.backupsDir);
    const manager = new BaiduBackupManager(paths, mockBackups as any);

    manager.updateConfig({ enabled: true, netdiskPath: path.join(tempRoot, "nonexistent") });

    await expect(manager.syncToNetdisk()).rejects.toThrow("百度网盘目录不存在");
    const config = manager.getConfig();
    expect(config.lastSyncStatus).toBe("error");
    expect(config.lastSyncError).toContain("百度网盘目录不存在");
  });

  it("清单文件包含正确元数据", async () => {
    const paths = makePaths(tempRoot);
    const mockBackups = makeMockBackupManager(paths.backupsDir);
    const manager = new BaiduBackupManager(paths, mockBackups as any);

    manager.updateConfig({ enabled: true, netdiskPath: netdiskDir });
    await manager.syncToNetdisk();

    const manifest = JSON.parse(fs.readFileSync(path.join(netdiskDir, "sock-erp-backups", "latest-manifest.json"), "utf8"));
    expect(manifest.sourceBackup).toBe("manual-2024-01-01-test.sqlite");
    expect(manifest.files.length).toBeGreaterThanOrEqual(1);
    expect(manifest.appVersion).toBe("sock-erp-1.0");
  });

  it("列出远程备份文件", async () => {
    const paths = makePaths(tempRoot);
    const mockBackups = makeMockBackupManager(paths.backupsDir);
    const manager = new BaiduBackupManager(paths, mockBackups as any);

    manager.updateConfig({ enabled: true, netdiskPath: netdiskDir });
    await manager.syncToNetdisk();

    const remote = manager.listRemoteBackups();
    expect(remote.length).toBe(1);
    expect(remote[0].filename).toBe("manual-2024-01-01-test.sqlite");
    expect(remote[0].size).toBeGreaterThan(0);
  });

  it("未配置网盘路径时 listRemoteBackups 返回空数组", () => {
    const paths = makePaths(tempRoot);
    const mockBackups = makeMockBackupManager(paths.backupsDir);
    const manager = new BaiduBackupManager(paths, mockBackups as any);

    const remote = manager.listRemoteBackups();
    expect(remote).toEqual([]);
  });
});
