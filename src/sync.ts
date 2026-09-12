import { supabase, SUPABASE_CONFIG } from "./supabase";

// 保存原始localStorage方法（在任何patch之前捕获）
const originalLocalStorage = {
  getItem: localStorage.getItem.bind(localStorage),
  setItem: localStorage.setItem.bind(localStorage),
  removeItem: localStorage.removeItem.bind(localStorage),
};

/** 同步状态 */
export type SyncStatus = "idle" | "syncing" | "error" | "offline";

/** 单条云数据记录 */
interface CloudRecord {
  id: string;
  storage_key: string;
  data: unknown;
  updated_at: string;
  device_id: string | null;
}

/** 需要同步的key前缀 */
const SYNC_PREFIX = "sock-erp-";

/** 同步防抖时间（毫秒） */
const DEBOUNCE_MS = 1500;

/** 生成设备ID */
function getDeviceId(): string {
  let id = originalLocalStorage.getItem("sock-erp-device-id");
  if (!id) {
    id =
      "device-" +
      Math.random().toString(36).substring(2, 10) +
      "-" +
      Date.now().toString(36);
    originalLocalStorage.setItem("sock-erp-device-id", id);
  }
  return id;
}

const deviceId = getDeviceId();

/** 待同步的写入队列 */
const pendingWrites = new Map<string, { value: string; timer: ReturnType<typeof setTimeout> }>();

/** 待同步的删除队列 */
const pendingDeletes = new Set<string>();

/** 同步状态回调 */
type StatusListener = (status: SyncStatus, detail?: string) => void;
const statusListeners = new Set<StatusListener>();

let currentStatus: SyncStatus = "idle";
let realtimeChannel: { unsubscribe: () => void } | null = null;
let initialized = false;

function setStatus(status: SyncStatus, detail?: string) {
  currentStatus = status;
  statusListeners.forEach((fn) => fn(status, detail));
}

/** 判断是否是需要同步的key */
function shouldSync(key: string): boolean {
  return key.startsWith(SYNC_PREFIX) && key !== "sock-erp-device-id";
}

/** 防抖写入云端 */
function queueCloudWrite(key: string, value: string) {
  if (!SUPABASE_CONFIG.enabled) return;
  if (!shouldSync(key)) return;

  const existing = pendingWrites.get(key);
  if (existing) clearTimeout(existing.timer);

  const timer = setTimeout(() => {
    pendingWrites.delete(key);
    void upsertToCloud(key, value);
  }, DEBOUNCE_MS);

  pendingWrites.set(key, { value, timer });
}

/** 防抖删除云端 */
function queueCloudDelete(key: string) {
  if (!SUPABASE_CONFIG.enabled) return;
  if (!shouldSync(key)) return;

  pendingDeletes.add(key);
  setTimeout(() => {
    if (pendingDeletes.has(key)) {
      pendingDeletes.delete(key);
      void deleteFromCloud(key);
    }
  }, DEBOUNCE_MS);
}

/** 写入云端（upsert） */
async function upsertToCloud(key: string, value: string) {
  try {
    setStatus("syncing");
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = value;
    }

    const { error } = await supabase
      .from("app_data")
      .upsert(
        {
          storage_key: key,
          data: parsed,
          device_id: deviceId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "storage_key" },
      );

    if (error) throw error;
    setStatus("idle");
  } catch (error) {
    console.error("[CloudSync] 写入失败:", error);
    setStatus("error", (error as Error).message);
    // 网络错误时标记离线，稍后重试
    if (error instanceof TypeError || (error as Error).message?.includes("Network")) {
      setStatus("offline");
    }
  }
}

/** 从云端删除 */
async function deleteFromCloud(key: string) {
  try {
    setStatus("syncing");
    const { error } = await supabase.from("app_data").delete().eq("storage_key", key);
    if (error) throw error;
    setStatus("idle");
  } catch (error) {
    console.error("[CloudSync] 删除失败:", error);
    setStatus("error", (error as Error).message);
  }
}

/** 从云端拉取全部数据并合并到本地 */
async function pullFromCloud(): Promise<number> {
  if (!SUPABASE_CONFIG.enabled) return 0;

  try {
    setStatus("syncing");
    const { data, error } = await supabase
      .from("app_data")
      .select("storage_key, data, updated_at, device_id");

    if (error) throw error;

    let merged = 0;
    const records = (data as CloudRecord[]) || [];

    for (const record of records) {
      const localValue = originalLocalStorage.getItem(record.storage_key);
      const cloudValue = JSON.stringify(record.data);

      if (localValue === null) {
        // 本地没有，直接用云端
        originalLocalStorage.setItem(record.storage_key, cloudValue);
        merged++;
      } else if (record.device_id !== deviceId) {
        // 来自其他设备，比较更新时间
        try {
          const localData = JSON.parse(localValue);
          const localTime = localData?._cloud_updated_at;
          if (!localTime || new Date(record.updated_at) > new Date(localTime)) {
            // 云端更新，合并
            const mergedData =
              typeof record.data === "object" && record.data !== null
                ? { ...record.data, _cloud_updated_at: record.updated_at }
                : record.data;
            originalLocalStorage.setItem(record.storage_key, JSON.stringify(mergedData));
            merged++;
          }
        } catch {
          originalLocalStorage.setItem(record.storage_key, cloudValue);
          merged++;
        }
      }
    }

    setStatus("idle");
    return merged;
  } catch (error) {
    console.error("[CloudSync] 拉取失败:", error);
    setStatus("offline");
    return 0;
  }
}

/** 订阅实时变更 */
function subscribeRealtime() {
  if (!SUPABASE_CONFIG.enabled) return;

  realtimeChannel = supabase
    .channel("app_data_changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "app_data" },
      (payload) => {
        const record = payload.new as CloudRecord | null;
        const oldRecord = payload.old as CloudRecord | null;
        const key = record?.storage_key || oldRecord?.storage_key;

        if (!key || !shouldSync(key)) return;
        if (record?.device_id === deviceId) return; // 自己的变更忽略

        if (payload.eventType === "DELETE" && oldRecord) {
          originalLocalStorage.removeItem(oldRecord.storage_key);
          window.dispatchEvent(new CustomEvent("cloud-storage-sync", { detail: { key, type: "delete" } }));
        } else if (record) {
          const value = JSON.stringify(record.data);
          originalLocalStorage.setItem(key, value);
          window.dispatchEvent(new CustomEvent("cloud-storage-sync", { detail: { key, type: "update" } }));
        }
      },
    )
    .subscribe();
}

/** 云存储包装器 - 替代直接使用localStorage */
export const cloudStorage = {
  getItem(key: string): string | null {
    return originalLocalStorage.getItem(key);
  },

  setItem(key: string, value: string): void {
    originalLocalStorage.setItem(key, value);
    queueCloudWrite(key, value);
    // 通知同页面其他组件
    window.dispatchEvent(new CustomEvent("cloud-storage-local", { detail: { key } }));
  },

  removeItem(key: string): void {
    originalLocalStorage.removeItem(key);
    queueCloudDelete(key);
    window.dispatchEvent(new CustomEvent("cloud-storage-local", { detail: { key } }));
  },

  /** 初始化：从云端拉取 + 订阅实时变更 */
  async init(): Promise<{ merged: number }> {
    if (initialized) return { merged: 0 };
    initialized = true;

    if (!SUPABASE_CONFIG.enabled) {
      setStatus("idle");
      return { merged: 0 };
    }

    const merged = await pullFromCloud();
    subscribeRealtime();

    // 监听网络状态
    window.addEventListener("online", () => {
      setStatus("syncing");
      // 重新同步所有待写入项
      for (const [key, { value }] of pendingWrites) {
        void upsertToCloud(key, value);
      }
      void pullFromCloud();
    });

    return { merged };
  },

  /** 强制全量同步 */
  async forceSync(): Promise<void> {
    // 先flush所有待写入
    for (const [key, { value, timer }] of pendingWrites) {
      clearTimeout(timer);
      pendingWrites.delete(key);
      await upsertToCloud(key, value);
    }
    // 再拉取
    await pullFromCloud();
  },

  /** 获取当前同步状态 */
  getStatus(): SyncStatus {
    return currentStatus;
  },

  /** 监听状态变化 */
  onStatusChange(fn: StatusListener): () => void {
    statusListeners.add(fn);
    return () => statusListeners.delete(fn);
  },

  /** 获取设备ID */
  getDeviceId(): string {
    return deviceId;
  },

  /** 是否启用云同步 */
  isEnabled(): boolean {
    return SUPABASE_CONFIG.enabled;
  },
};

/** React Hook: 监听云同步状态 */
import { useEffect, useState } from "react";

export function useSyncStatus(): SyncStatus {
  const [status, setStatusState] = useState<SyncStatus>(currentStatus);
  useEffect(() => {
    return cloudStorage.onStatusChange((s) => setStatusState(s));
  }, []);
  return status;
}

/** React Hook: 监听某个key的云端变更，自动刷新 */
export function useCloudStorage<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = cloudStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { key: string };
      if (detail.key === key) {
        try {
          const raw = cloudStorage.getItem(key);
          setValue(raw ? (JSON.parse(raw) as T) : initial);
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener("cloud-storage-sync", handler);
    window.addEventListener("cloud-storage-local", handler);
    return () => {
      window.removeEventListener("cloud-storage-sync", handler);
      window.removeEventListener("cloud-storage-local", handler);
    };
  }, [key, initial]);

  const set = (newValue: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const resolved = typeof newValue === "function" ? (newValue as (p: T) => T)(prev) : newValue;
      cloudStorage.setItem(key, JSON.stringify(resolved));
      return resolved;
    });
  };

  return [value, set];
}
