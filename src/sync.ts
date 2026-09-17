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

/**
 * 各 key 的云端更新时间统一存放在这个独立的 meta 对象里。
 * 之前把 _cloud_updated_at 直接展开进业务数据，会把数组（如原材料、翻袜等）
 * 污染成 {0:..., 1:..., _cloud_updated_at:...} 的普通对象，导致页面 Array.isArray 判定失败。
 */
const SYNC_META_KEY = "sock-erp-sync-meta";

type SyncMeta = Record<string, string>;

/** 读取同步时间戳 meta（meta 本身是对象，不会被污染） */
function getSyncMeta(): SyncMeta {
  try {
    const raw = originalLocalStorage.getItem(SYNC_META_KEY);
    return raw ? (JSON.parse(raw) as SyncMeta) : {};
  } catch {
    return {};
  }
}

/** 写入同步时间戳 meta（不经过云同步，避免循环） */
function setSyncMeta(meta: SyncMeta): void {
  try {
    originalLocalStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
  } catch {
    /* 存储空间不足等情况忽略 */
  }
}

/**
 * 修复历史上被错误展开污染的数组。
 * 被污染的数组形如 {"0":{...},"1":{...},"_cloud_updated_at":"..."}，
 * 当数字键连续为 0..n-1 时还原为真正的数组。
 */
export function repairPollutedArray(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  const numericKeys = keys.filter((k) => /^\d+$/.test(k)).map(Number);
  if (numericKeys.length === 0) return value;

  // 必须是从 0 开始的连续整数键，才认定是被污染的数组
  const maxKey = Math.max(...numericKeys);
  let continuous = true;
  for (let i = 0; i <= maxKey; i++) {
    if (!Object.prototype.hasOwnProperty.call(obj, String(i))) {
      continuous = false;
      break;
    }
  }
  if (!continuous) return value;

  // 数组元素占绝大多数（允许混入时间戳字段），才还原
  const nonNumericKeys = keys.filter((k) => !/^\d+$/.test(k));
  const allowedMetaKeys = new Set(["_cloud_updated_at"]);
  const onlyMeta = nonNumericKeys.every((k) => allowedMetaKeys.has(k));
  if (!onlyMeta) return value;

  const arr: unknown[] = [];
  for (let i = 0; i <= maxKey; i++) {
    arr.push(obj[String(i)]);
  }
  return arr;
}

/** 启动时扫描并修复本地所有被污染的业务数据 */
function repairAllLocal(): number {
  let repaired = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !shouldSync(key)) continue;
      const raw = originalLocalStorage.getItem(key);
      if (!raw) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      const fixed = repairPollutedArray(parsed);
      if (fixed !== parsed) {
        originalLocalStorage.setItem(key, JSON.stringify(fixed));
        repaired++;
      }
    }
  } catch {
    /* 忽略 */
  }
  return repaired;
}

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
  return (
    key.startsWith(SYNC_PREFIX) &&
    key !== "sock-erp-device-id" &&
    key !== SYNC_META_KEY
  );
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

    const updatedAt = new Date().toISOString();
    const { error } = await supabase
      .from("app_data")
      .upsert(
        {
          storage_key: key,
          data: parsed,
          device_id: deviceId,
          updated_at: updatedAt,
        },
        { onConflict: "storage_key" },
      );

    if (error) throw error;
    // 时间戳单独存到 meta，不污染业务数据（尤其数组）
    const meta = getSyncMeta();
    meta[key] = updatedAt;
    setSyncMeta(meta);
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
    const meta = getSyncMeta();

    for (const record of records) {
      // 跳过内部 meta key（兼容旧数据）
      if (record.storage_key === SYNC_META_KEY) continue;

      // 云端数据先修复历史污染（数组被展开成对象的情况）
      const cloudData = repairPollutedArray(record.data);
      const cloudValue = JSON.stringify(cloudData);
      const localValue = originalLocalStorage.getItem(record.storage_key);

      if (localValue === null) {
        // 本地没有，直接用云端（原样写入，不展开时间戳）
        originalLocalStorage.setItem(record.storage_key, cloudValue);
        meta[record.storage_key] = record.updated_at;
        merged++;
      } else if (record.device_id !== deviceId) {
        // 来自其他设备，用独立 meta 中的时间戳比较，不再读取业务数据内的字段
        const localTime = meta[record.storage_key];
        if (!localTime || new Date(record.updated_at) > new Date(localTime)) {
          // 云端更新，原样写入（数组保持数组、对象保持对象）
          originalLocalStorage.setItem(record.storage_key, cloudValue);
          meta[record.storage_key] = record.updated_at;
          merged++;
        }
      }
    }

    setSyncMeta(meta);
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
          const meta = getSyncMeta();
          delete meta[oldRecord.storage_key];
          setSyncMeta(meta);
          window.dispatchEvent(new CustomEvent("cloud-storage-sync", { detail: { key, type: "delete" } }));
        } else if (record) {
          // 实时推送同样修复污染，并原样写入，不展开时间戳
          const fixed = repairPollutedArray(record.data);
          originalLocalStorage.setItem(key, JSON.stringify(fixed));
          const meta = getSyncMeta();
          meta[key] = record.updated_at;
          setSyncMeta(meta);
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

    // 先修复本地历史上被污染的数组数据
    const repaired = repairAllLocal();
    if (repaired > 0) {
      console.warn(`[CloudSync] 已修复 ${repaired} 个被污染的本地数据`);
    }

    if (!SUPABASE_CONFIG.enabled) {
      setStatus("idle");
      return { merged: 0 };
    }

    const merged = await pullFromCloud();
    // 云端拉取后再修复一次，确保新数据正常
    repairAllLocal();
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
