import { supabase, SUPABASE_CONFIG } from "./supabase";
import { emitUiPreferencesChanged, isUiPreferencesStorageKey } from "./ui-preferences";
import {
  ENTRIES_META_KEY,
  emptyEntryMeta,
  mergeEntriesMeta,
  mergeItemArrays,
  computeMetaAfterLocalWrite,
  isItemArray,
  type SyncEntriesMeta,
} from "./sync-merge";

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

/**
 * 持久化「待上传写入 / 删除」的队列。
 * 关键修复：上传做了 1.5s 防抖，定时器只存在内存里；用户在防抖窗口内刷新 / 关闭页面，
 * 待上传的变更（尤其删除）会丢失，而启动时的 pullFromCloud 只读不写，
 * 导致删除只停留在本地、云端仍保留被删条目，换设备 / 再次刷新后条目「复活」。
 * 把待上传的 key 持久化到 localStorage，启动时据此补传。
 */
const PENDING_QUEUE_KEY = "sock-erp-sync-pending";
type PendingOp = "put" | "del";
let pendingQueue: Record<string, PendingOp> = loadPendingQueue();

function loadPendingQueue(): Record<string, PendingOp> {
  try {
    const raw = originalLocalStorage.getItem(PENDING_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, PendingOp>) : {};
  } catch {
    return {};
  }
}

function savePendingQueue(): void {
  try {
    originalLocalStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(pendingQueue));
  } catch {
    /* 忽略存储异常 */
  }
}

function markPending(key: string, op: PendingOp): void {
  // 同一 key 的最新操作覆盖旧操作（删除与新增以最后一次为准）
  pendingQueue[key] = op;
  savePendingQueue();
}

function clearPending(key: string, op: PendingOp): void {
  if (pendingQueue[key] === op) {
    delete pendingQueue[key];
    savePendingQueue();
  }
}

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

// ===== 多设备条目级合并的状态 =====
/** 各业务 key 的条目元数据（rev / 墓碑），集中存放、独立同步，不污染业务数据 */
let entriesMeta: SyncEntriesMeta = loadEntriesMeta();
/** 每个 key 上一次跟踪到的数组快照（JSON），用于检测本地新增/编辑/删除 */
const itemSnapshots = new Map<string, string>();
/** 已知为「条目数组」的 key 集合（空数组也能据此识别） */
const knownItemKeys = new Set<string>();
/** 条目元数据是否有本地改动待上传 */
let metaDirty = false;
let metaUploadTimer: ReturnType<typeof setTimeout> | null = null;
let pullTimer: ReturnType<typeof setTimeout> | null = null;

function loadEntriesMeta(): SyncEntriesMeta {
  try {
    const raw = originalLocalStorage.getItem(ENTRIES_META_KEY);
    return raw ? (JSON.parse(raw) as SyncEntriesMeta) : {};
  } catch {
    return {};
  }
}

function saveEntriesMetaLocally(): void {
  try {
    originalLocalStorage.setItem(ENTRIES_META_KEY, JSON.stringify(entriesMeta));
  } catch {
    /* 忽略 */
  }
}

function safeParse(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** 判断某份数据是否应作为条目数组处理（结合已知 key 集合兼容空数组） */
function asItemArray(value: unknown, key: string): Array<Record<string, unknown>> | null {
  if (isItemArray(value)) return value as Array<Record<string, unknown>>;
  if (Array.isArray(value) && value.length === 0 && knownItemKeys.has(key)) return [];
  return null;
}

/**
 * 跟踪一次本地写入，更新条目元数据（新增/编辑写 rev，删除写墓碑，恢复写 r）。
 * 仅在本地业务数据通过 cloudStorage.setItem 写入时调用；云端拉取走 originalLocalStorage，
 * 不会经过这里，避免把云端数据误判为本地修改。
 */
function trackLocalWrite(key: string, value: string): void {
  if (!shouldSync(key) || key === ENTRIES_META_KEY || key === SYNC_META_KEY) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return;
  }
  const items = asItemArray(parsed, key);
  if (!items) {
    // 非条目数组（普通对象、字符串/数字数组配置，如菜单可见性、快速新增）：
    // 仅记录快照、走整份 LWW。字符串路径没有 id，若误走条目合并会被全部算成
    // 同一个 id "undefined" 而互相覆盖，导致菜单越同步越少。
    itemSnapshots.set(key, value);
    return;
  }

  knownItemKeys.add(key);
  const nextItems = items;
  const prevRaw = itemSnapshots.get(key) ?? null;
  const prevParsed = safeParse(prevRaw);
  const prevItems = isItemArray(prevParsed)
    ? (prevParsed as Array<Record<string, unknown>>)
    : Array.isArray(prevParsed) && prevParsed.length === 0
      ? []
      : null;

  entriesMeta[key] = computeMetaAfterLocalWrite(prevItems, nextItems, entriesMeta[key], Date.now());
  saveEntriesMetaLocally();
  metaDirty = true;
  scheduleMetaUpload();

  itemSnapshots.set(key, value);
}

/** 启动时为本地所有条目数组建立快照基线，使首次写入即可正确检测删除 */
function buildLocalSnapshots(): void {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !shouldSync(key) || key === ENTRIES_META_KEY) continue;
      if (!itemSnapshots.has(key)) {
        itemSnapshots.set(key, originalLocalStorage.getItem(key) ?? "null");
      }
      const parsed = safeParse(originalLocalStorage.getItem(key));
      if (isItemArray(parsed)) knownItemKeys.add(key);
    }
  } catch {
    /* 忽略 */
  }
}

/** 拉取云端最新条目元数据并两级合并到本地 */
async function fetchAndMergeCloudMeta(): Promise<SyncEntriesMeta | undefined> {
  const { data, error } = await supabase
    .from("app_data")
    .select("data")
    .eq("storage_key", ENTRIES_META_KEY)
    .maybeSingle();
  if (error) throw error;
  const cloudMeta = data?.data as SyncEntriesMeta | undefined;
  if (cloudMeta) {
    entriesMeta = mergeEntriesMeta(entriesMeta, cloudMeta);
    saveEntriesMetaLocally();
  }
  return cloudMeta;
}

/** 防抖上传条目元数据（上传前先合并云端，避免覆盖其他设备的元数据） */
function scheduleMetaUpload(): void {
  if (!SUPABASE_CONFIG.enabled) return;
  if (metaUploadTimer) clearTimeout(metaUploadTimer);
  metaUploadTimer = setTimeout(() => {
    metaUploadTimer = null;
    void uploadEntriesMeta();
  }, DEBOUNCE_MS);
}

async function uploadEntriesMeta(): Promise<void> {
  if (!SUPABASE_CONFIG.enabled || !metaDirty) return;
  try {
    setStatus("syncing");
    await fetchAndMergeCloudMeta();
    const updatedAt = await upsertRow(ENTRIES_META_KEY, entriesMeta);
    metaDirty = false;
    const meta = getSyncMeta();
    meta[ENTRIES_META_KEY] = updatedAt;
    setSyncMeta(meta);
    setStatus("idle");
  } catch (error) {
    console.error("[CloudSync] 条目元数据上传失败:", error);
    metaDirty = true; // 保留待重试
    setStatus("error", (error as Error).message);
  }
}

/** 防抖触发一次全量拉取（收到云端 meta 推送后用于最终一致） */
function schedulePullFromCloud(): void {
  if (!SUPABASE_CONFIG.enabled) return;
  if (pullTimer) clearTimeout(pullTimer);
  pullTimer = setTimeout(() => {
    pullTimer = null;
    void pullFromCloud();
  }, 1200);
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
    key !== SYNC_META_KEY &&
    key !== PENDING_QUEUE_KEY
  );
}

/** 直接 upsert 一行（含时间戳），返回写入时间 */
async function upsertRow(key: string, data: unknown): Promise<string> {
  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from("app_data")
    .upsert(
      { storage_key: key, data, device_id: deviceId, updated_at: updatedAt },
      { onConflict: "storage_key" },
    );
  if (error) throw error;
  return updatedAt;
}

/** 防抖写入云端 */
function queueCloudWrite(key: string, value: string) {
  if (!SUPABASE_CONFIG.enabled) return;
  if (!shouldSync(key)) return;

  // 立即持久化待上传标记，防抖窗口内刷新 / 关闭也不会丢，启动时补传
  markPending(key, "put");

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

  markPending(key, "del");
  pendingDeletes.add(key);
  setTimeout(() => {
    if (pendingDeletes.has(key)) {
      pendingDeletes.delete(key);
      void deleteFromCloud(key);
    }
  }, DEBOUNCE_MS);
}

/** 写入云端：条目数组做「读云端→合并→写回」，对象类直接 LWW */
async function upsertToCloud(key: string, value: string) {
  try {
    setStatus("syncing");
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = value;
    }

    const items = asItemArray(parsed, key);

    if (items) {
      // 多设备并发安全：先读云端业务行 + 全局条目元数据，做条目级并集后再写回
      const [bizRes, metaRes] = await Promise.all([
        supabase
          .from("app_data")
          .select("data,updated_at,device_id")
          .eq("storage_key", key)
          .maybeSingle(),
        supabase
          .from("app_data")
          .select("data")
          .eq("storage_key", ENTRIES_META_KEY)
          .maybeSingle(),
      ]);
      if (bizRes.error) throw bizRes.error;
      if (metaRes.error) throw metaRes.error;

      const cloudMetaGlobal = metaRes.data?.data as SyncEntriesMeta | undefined;
      if (cloudMetaGlobal) {
        entriesMeta = mergeEntriesMeta(entriesMeta, cloudMetaGlobal);
      }
      const cloudParsed = repairPollutedArray(bizRes.data?.data);
      const cloudArr = Array.isArray(cloudParsed)
        ? (cloudParsed as Array<Record<string, unknown>>)
        : [];
      const localArr = items;
      const mergedArr = mergeItemArrays(localArr, cloudArr, entriesMeta[key], cloudMetaGlobal?.[key]);
      entriesMeta[key] = mergeEntriesMeta(
        { __k: entriesMeta[key] ?? emptyEntryMeta() },
        { __k: cloudMetaGlobal?.[key] ?? emptyEntryMeta() },
      ).__k;
      saveEntriesMetaLocally();

      const mergedValue = JSON.stringify(mergedArr);
      if (mergedValue !== value) {
        // 云端有本地缺失的条目（其他设备新增），合并回本地并通知 UI 刷新
        originalLocalStorage.setItem(key, mergedValue);
        itemSnapshots.set(key, mergedValue);
        window.dispatchEvent(new CustomEvent("cloud-storage-sync", { detail: { key, type: "merge" } }));
      }

      const bizUpdatedAt = await upsertRow(key, mergedArr);
      await upsertRow(ENTRIES_META_KEY, entriesMeta);
      metaDirty = false;
      clearPending(key, "put");

      const meta = getSyncMeta();
      meta[key] = bizUpdatedAt;
      meta[ENTRIES_META_KEY] = bizUpdatedAt;
      setSyncMeta(meta);
      setStatus("idle");
      return;
    }

    // 对象类：整份 last-write-wins
    const updatedAt = await upsertRow(key, parsed);
    clearPending(key, "put");
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
    clearPending(key, "del");
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
    let uiPrefsChanged = false;
    const changedKeys: string[] = [];
    // 记录「本地领先云端」的条目数组 key（本地删除/新增尚未到达云端），拉取后回写收敛
    const pushBackKeys = new Set<string>();
    const records = (data as CloudRecord[]) || [];
    const meta = getSyncMeta();

    // 1) 先取出云端条目元数据并两级合并，供后续条目级合并使用
    const cloudEntriesMetaRecord = records.find((r) => r.storage_key === ENTRIES_META_KEY);
    if (cloudEntriesMetaRecord?.data) {
      entriesMeta = mergeEntriesMeta(entriesMeta, cloudEntriesMetaRecord.data as SyncEntriesMeta);
      saveEntriesMetaLocally();
    }

    // 拉取写入本地时统一用原始 setItem（不触发本设备的回写/上传），记录被写入的 key
    const applyCloudRecord = (record: CloudRecord, cloudValue: string) => {
      originalLocalStorage.setItem(record.storage_key, cloudValue);
      meta[record.storage_key] = record.updated_at;
      changedKeys.push(record.storage_key);
      merged++;
      if (isUiPreferencesStorageKey(record.storage_key)) uiPrefsChanged = true;
    };

    for (const record of records) {
      // 跳过内部 meta key
      if (record.storage_key === SYNC_META_KEY || record.storage_key === ENTRIES_META_KEY) continue;

      // 云端数据先修复历史污染（数组被展开成对象的情况）
      const cloudData = repairPollutedArray(record.data);
      const key = record.storage_key;
      const localRaw = originalLocalStorage.getItem(key);
      const localParsed = safeParse(localRaw);

      const cloudItems = asItemArray(cloudData, key);
      const localItems = asItemArray(localParsed, key);

      // 2) 条目数组：按 id 并集合并 + 墓碑删除，多设备各自新增/删除互不覆盖
      if (cloudItems !== null || (localItems !== null && Array.isArray(cloudData))) {
        knownItemKeys.add(key);
        const cloudArr = Array.isArray(cloudData) ? (cloudData as Array<Record<string, unknown>>) : [];
        const localArr = Array.isArray(localParsed) ? (localParsed as Array<Record<string, unknown>>) : [];
        const cloudMetaForKey = (cloudEntriesMetaRecord?.data as SyncEntriesMeta | undefined)?.[key];
        const mergedArr = mergeItemArrays(localArr, cloudArr, entriesMeta[key], cloudMetaForKey);
        if (cloudMetaForKey) {
          entriesMeta[key] = mergeEntriesMeta(
            { __k: entriesMeta[key] ?? emptyEntryMeta() },
            { __k: cloudMetaForKey },
          ).__k;
        } else if (!entriesMeta[key]) {
          entriesMeta[key] = emptyEntryMeta();
        }
        saveEntriesMetaLocally();
        const mergedValue = JSON.stringify(mergedArr);
        itemSnapshots.set(key, mergedValue);
        // 检测本地是否领先云端：云端有但合并后被墓碑剔除（本地删除），或本地有云端无（本地新增）。
        // 这类差异若不回写，一旦本地变更在防抖窗口内丢失，刷新 / 换设备后被删条目就会复活。
        const mergedIds = new Set(mergedArr.map((i) => String(i.id)));
        for (const cloudItem of cloudArr) {
          if (!mergedIds.has(String(cloudItem.id))) {
            pushBackKeys.add(key);
            break;
          }
        }
        if (!pushBackKeys.has(key)) {
          for (const mergedItem of mergedArr) {
            if (!cloudArr.some((c) => String(c.id) === String(mergedItem.id))) {
              pushBackKeys.add(key);
              break;
            }
          }
        }
        if (localRaw !== mergedValue) {
          originalLocalStorage.setItem(key, mergedValue);
          meta[key] = record.updated_at;
          changedKeys.push(key);
          merged++;
          if (isUiPreferencesStorageKey(key)) uiPrefsChanged = true;
        }
        continue;
      }

      // 3) 非条目（对象类）数据：保持整份 last-write-wins
      if (localRaw === null) {
        // 本地没有，直接用云端
        applyCloudRecord(record, JSON.stringify(cloudData));
      } else if (record.device_id !== deviceId) {
        // 来自其他设备，用独立 meta 中的时间戳比较
        const localTime = meta[key];
        if (!localTime || new Date(record.updated_at) > new Date(localTime)) {
          applyCloudRecord(record, JSON.stringify(cloudData));
        }
      }
    }

    setSyncMeta(meta);
    // 把本地领先云端的条目变更（含删除墓碑）回写云端，防止防抖窗口内丢失的删除在刷新 / 换设备后复活
    await pushBackLocalItemChanges(pushBackKeys);
    if (uiPrefsChanged) emitUiPreferencesChanged();
    // 冷启动时组件可能先于云拉取挂载、读到空数据。对每个写入的 key 派发事件，
    // 让对应组件把状态更新为云端数据，避免随后新增时基于过时空状态覆盖云端记录。
    for (const changedKey of changedKeys) {
      window.dispatchEvent(new CustomEvent("cloud-storage-sync", { detail: { key: changedKey, type: "pull" } }));
    }
    setStatus("idle");
    return merged;
  } catch (error) {
    console.error("[CloudSync] 拉取失败:", error);
    setStatus("offline");
    return 0;
  }
}

/**
 * 拉取合并后，把本地领先云端的条目数组（含删除墓碑）回写云端。
 * 入参中的数组在本地已是「本地 + 云端」合并全集（已按墓碑过滤），直接 upsert 不会覆盖
 * 其他设备的条目；同时把最新条目元数据（含墓碑）一并上传，删除才能传播到其他设备。
 * 这是「删除后在防抖窗口内刷新、待上传丢失」的兜底收敛路径。
 */
async function pushBackLocalItemChanges(keys: Set<string>): Promise<void> {
  if (keys.size === 0) return;
  try {
    for (const key of keys) {
      const parsed = safeParse(originalLocalStorage.getItem(key));
      if (!Array.isArray(parsed)) continue;
      const ts = await upsertRow(key, parsed);
      clearPending(key, "put");
      const m = getSyncMeta();
      m[key] = ts;
      setSyncMeta(m);
    }
    // 墓碑 / rev 必须随业务数据一起上传，其他设备才能收到删除
    await upsertRow(ENTRIES_META_KEY, entriesMeta);
    metaDirty = false;
    const m = getSyncMeta();
    m[ENTRIES_META_KEY] = new Date().toISOString();
    setSyncMeta(m);
  } catch (error) {
    console.error("[CloudSync] 本地领先变更回写失败:", error);
    // 回写失败不阻塞启动；保留待重试标记，下次定时上传 / forceSync 会收敛
    metaDirty = true;
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
          itemSnapshots.delete(oldRecord.storage_key);
          knownItemKeys.delete(oldRecord.storage_key);
          const meta = getSyncMeta();
          delete meta[oldRecord.storage_key];
          setSyncMeta(meta);
          window.dispatchEvent(new CustomEvent("cloud-storage-sync", { detail: { key, type: "delete" } }));
          return;
        }

        if (!record) return;
        const fixed = repairPollutedArray(record.data);

        // 条目元数据行：两级合并后触发一次全量拉取做最终一致
        if (key === ENTRIES_META_KEY) {
          entriesMeta = mergeEntriesMeta(entriesMeta, fixed as SyncEntriesMeta);
          saveEntriesMetaLocally();
          schedulePullFromCloud();
          window.dispatchEvent(new CustomEvent("cloud-storage-sync", { detail: { key, type: "update" } }));
          return;
        }

        // 条目数组：按 id 合并（云端 meta 以当前已合并的 meta 近似，meta 行到达后会再全量纠正）
        const cloudItems = asItemArray(fixed, key);
        const localParsed = safeParse(originalLocalStorage.getItem(key));
        if (cloudItems !== null || (isItemArray(localParsed) && Array.isArray(fixed))) {
          knownItemKeys.add(key);
          const cloudArr = Array.isArray(fixed) ? (fixed as Array<Record<string, unknown>>) : [];
          const localArr = Array.isArray(localParsed) ? (localParsed as Array<Record<string, unknown>>) : [];
          const mergedArr = mergeItemArrays(localArr, cloudArr, entriesMeta[key], entriesMeta[key]);
          const mergedValue = JSON.stringify(mergedArr);
          originalLocalStorage.setItem(key, mergedValue);
          itemSnapshots.set(key, mergedValue);
          const meta = getSyncMeta();
          meta[key] = record.updated_at;
          setSyncMeta(meta);
          window.dispatchEvent(new CustomEvent("cloud-storage-sync", { detail: { key, type: "update" } }));
          return;
        }

        // 对象类：整份写入
        originalLocalStorage.setItem(key, JSON.stringify(fixed));
        const meta = getSyncMeta();
        meta[key] = record.updated_at;
        setSyncMeta(meta);
        window.dispatchEvent(new CustomEvent("cloud-storage-sync", { detail: { key, type: "update" } }));
      },
    )
    .subscribe();
}

/**
 * 启动时补传防抖窗口内丢失的本地写入 / 删除。
 * 待上传队列持久化在 localStorage（PENDING_QUEUE_KEY），即使上次在 1.5s 防抖内
 * 刷新 / 关闭页面、定时器被销毁，这次启动也能把本地最新值（含删除墓碑）同步到云端。
 * 条目数组的删除 / 新增已由 pullFromCloud 的回写兜底，这里再幂等补传一次，
 * 同时覆盖对象类（设置、菜单配置）与整份删除。
 */
async function flushPendingQueueOnStartup(): Promise<void> {
  const entries = Object.entries(pendingQueue);
  if (entries.length === 0) return;
  for (const [key, op] of entries) {
    if (!shouldSync(key)) {
      clearPending(key, op);
      continue;
    }
    if (op === "del") {
      await deleteFromCloud(key);
      // pull 可能已把云端旧值恢复到本地；删除意图下保持本地与云端一致
      originalLocalStorage.removeItem(key);
      itemSnapshots.delete(key);
      knownItemKeys.delete(key);
      continue;
    }
    const latest = originalLocalStorage.getItem(key);
    if (latest === null) {
      await deleteFromCloud(key);
    } else {
      await upsertToCloud(key, latest);
    }
  }
}

/** 云存储包装器 - 替代直接使用localStorage */
export const cloudStorage = {
  getItem(key: string): string | null {
    return originalLocalStorage.getItem(key);
  },

  setItem(key: string, value: string): void {
    originalLocalStorage.setItem(key, value);
    trackLocalWrite(key, value);
    queueCloudWrite(key, value);
    // 通知同页面其他组件
    window.dispatchEvent(new CustomEvent("cloud-storage-local", { detail: { key } }));
  },

  removeItem(key: string): void {
    originalLocalStorage.removeItem(key);
    itemSnapshots.delete(key);
    knownItemKeys.delete(key);
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

    // 建立本地条目快照基线，保证首次写入即可正确检测删除
    buildLocalSnapshots();

    if (!SUPABASE_CONFIG.enabled) {
      setStatus("idle");
      return { merged: 0 };
    }

    const merged = await pullFromCloud();
    // 云端拉取后再修复一次，确保新数据正常
    repairAllLocal();
    subscribeRealtime();
    // 补传上次在防抖窗口内刷新 / 关闭而丢失的本地写入、删除（含删除墓碑）
    await flushPendingQueueOnStartup();

    // 监听网络状态
    window.addEventListener("online", () => {
      setStatus("syncing");
      // 重新同步所有待写入项
      for (const [writeKey] of pendingWrites) {
        const latest = originalLocalStorage.getItem(writeKey);
        if (latest !== null) void upsertToCloud(writeKey, latest);
      }
      void uploadEntriesMeta();
      void pullFromCloud();
    });

    return { merged };
  },

  /** 强制全量同步：先拉取合并，再把本地最新值写回，最后再拉取一次收敛 */
  async forceSync(): Promise<void> {
    // 1) 先把云端最新合并进本地（pull 内部会回写本地领先的条目变更）
    await pullFromCloud();
    // 1.5) 补传防抖窗口内丢失的本地写入 / 删除（含对象类设置与整份删除）
    await flushPendingQueueOnStartup();
    // 2) flush 待写入（用本地最新值，内部会再读云端合并，杜绝覆盖）
    for (const [key, { timer }] of pendingWrites) {
      clearTimeout(timer);
      pendingWrites.delete(key);
      const latest = originalLocalStorage.getItem(key);
      if (latest !== null) await upsertToCloud(key, latest);
    }
    // 3) 上传条目元数据
    if (metaDirty) await uploadEntriesMeta();
    // 4) 再拉取一次，收敛到最终一致
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
