/**
 * 多设备条目级同步合并（纯函数，便于单测）。
 *
 * 背景：旧实现对每个 key 整份 last-write-wins，两台手机各自新增一条记录时，
 * 后上传的设备会把先上传设备的记录整体覆盖、造成数据丢失。
 *
 * 本模块对「条目数组」（元素是带 id 的对象，如原材料、翻袜、缝头、定型、各支出、
 * 回收站等）做按 id 的并集合并；删除通过墓碑（tombstone）传播；编辑通过条目版本
 * 号 rev 取最新。所有同步元数据集中在独立的 meta key 中，不写入业务数据本身，
 * 因此不会污染页面表格、Excel 导出等。
 *
 * 对于「对象类」数据（设置、偏好、菜单配置等）仍由调用方走整份 last-write-wins。
 */

/** 集中存放所有 key 的条目级同步元数据的 localStorage key */
export const ENTRIES_META_KEY = "sock-erp-sync-entries";

/** 单个 key 的条目元数据 */
export interface EntryMeta {
  /** 条目 id -> 最后新增/编辑时间（毫秒） */
  rev: Record<string, number>;
  /** 条目 id -> 删除时间 t / 恢复时间 r；r 晚于 t 表示已恢复 */
  tomb: Record<string, { t: number; r?: number }>;
}

/** storageKey -> 条目元数据 */
export type SyncEntriesMeta = Record<string, EntryMeta>;

const TS_RE = /(\d{13})/;

export function emptyEntryMeta(): EntryMeta {
  return { rev: {}, tomb: {} };
}

/** 从条目 id 中提取创建时间戳（id 形如 1789721521315-xxxx 或 cat_1789721521315_xxx） */
export function itemCreatedAt(item: unknown): number {
  if (item && typeof item === "object") {
    const id = (item as Record<string, unknown>).id;
    if (typeof id === "string" || typeof id === "number") {
      const m = String(id).match(TS_RE);
      if (m) return Number(m[1]);
    }
  }
  return 0;
}

/** 判断一份数据是否为「条目数组」（所有元素都是带 id 的对象）。空数组返回 false，由调用方结合已知集合判断。 */
export function isItemArray(value: unknown): value is Array<Record<string, unknown>> {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((x) => x && typeof x === "object" && "id" in x)
  );
}

/** 深拷贝（元数据均为 JSON 可序列化数据） */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 两级深合并条目元数据：storageKey -> (rev/tomb) -> id -> 值。
 * 数值取较大者，保证不同设备各自新增/编辑/删除的条目元数据都被保留。
 */
export function mergeEntriesMeta(local: SyncEntriesMeta, cloud: SyncEntriesMeta): SyncEntriesMeta {
  const out: SyncEntriesMeta = clone(local || {});
  for (const [key, cm] of Object.entries(cloud || {})) {
    const lm = out[key] ?? emptyEntryMeta();
    const rev: Record<string, number> = { ...lm.rev };
    for (const [id, t] of Object.entries(cm.rev || {})) {
      if (typeof t === "number" && (!rev[id] || t > rev[id])) rev[id] = t;
    }
    const tomb: EntryMeta["tomb"] = { ...lm.tomb };
    for (const [id, rec] of Object.entries(cm.tomb || {})) {
      const existing = tomb[id];
      if (!existing) {
        tomb[id] = { ...rec };
      } else {
        const t = Math.max(existing.t, rec.t);
        const r = Math.max(existing.r ?? 0, rec.r ?? 0);
        tomb[id] = r > 0 ? { t, r } : { t };
      }
    }
    out[key] = { rev, tomb };
  }
  return out;
}

/** 该 id 在给定元数据下是否处于「已删除」状态（删除时间晚于恢复时间） */
export function isItemDeleted(meta: EntryMeta | undefined, id: string): boolean {
  const rec = meta?.tomb?.[id];
  if (!rec) return false;
  return !rec.r || rec.t > rec.r;
}

/** 条目在给定元数据下的版本号：优先 rev，回退到 id 内嵌创建时间 */
function itemRev(item: unknown, meta: EntryMeta | undefined): number {
  const id = String((item as Record<string, unknown>)?.id ?? "");
  return meta?.rev?.[id] ?? itemCreatedAt(item);
}

/**
 * 条目级合并两个数组。
 * @param localArr 本地数组
 * @param cloudArr 云端数组
 * @param localMeta 该 key 的本地元数据
 * @param cloudMeta 该 key 的云端元数据
 * @returns 合并后的数组（顺序：本地原有顺序在前，云端新增的追加在后）
 */
export function mergeItemArrays(
  localArr: Array<Record<string, unknown>>,
  cloudArr: Array<Record<string, unknown>>,
  localMeta: EntryMeta | undefined,
  cloudMeta: EntryMeta | undefined,
): Array<Record<string, unknown>> {
  const combinedKey = "__combined__";
  const combinedMeta = mergeEntriesMeta(
    { [combinedKey]: localMeta ?? emptyEntryMeta() },
    { [combinedKey]: cloudMeta ?? emptyEntryMeta() },
  )[combinedKey];

  const winners = new Map<string, { item: Record<string, unknown>; rev: number }>();
  const consider = (item: Record<string, unknown>, meta: EntryMeta | undefined) => {
    const id = String(item.id);
    if (isItemDeleted(combinedMeta, id)) return;
    const rev = itemRev(item, meta);
    const existing = winners.get(id);
    if (!existing || rev > existing.rev) winners.set(id, { item, rev });
  };
  localArr.forEach((i) => consider(i, localMeta));
  cloudArr.forEach((i) => consider(i, cloudMeta));

  const ordered: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  const pushInOrder = (arr: Array<Record<string, unknown>>) => {
    for (const item of arr) {
      const id = String(item.id);
      if (!seen.has(id) && winners.has(id)) {
        ordered.push(winners.get(id)!.item);
        seen.add(id);
      }
    }
  };
  pushInOrder(localArr);
  pushInOrder(cloudArr);
  return ordered;
}

/**
 * 本地一次写入后，对比上一次数组快照，计算新的元数据。
 * - 新增 / 内容变化的条目：rev 置为当前时间
 * - 相比上次消失的条目：写入删除墓碑 t
 * - 曾被删除、本次重新出现的条目：写入恢复时间 r（恢复优先）
 */
export function computeMetaAfterLocalWrite(
  prevArr: Array<Record<string, unknown>> | null,
  nextArr: Array<Record<string, unknown>>,
  prevMeta: EntryMeta | undefined,
  now: number,
): EntryMeta {
  const meta: EntryMeta = {
    rev: { ...(prevMeta?.rev || {}) },
    tomb: { ...(prevMeta?.tomb || {}) },
  };

  const prevMap = new Map<string, Record<string, unknown>>();
  (prevArr || []).forEach((i) => prevMap.set(String(i.id), i));

  const nextIds = new Set<string>();
  nextArr.forEach((item) => {
    const id = String(item.id);
    nextIds.add(id);
    const prev = prevMap.get(id);
    if (!prev || JSON.stringify(prev) !== JSON.stringify(item)) {
      meta.rev[id] = now;
    }
    // 恢复：曾被删除且当前处于删除状态，现在重新出现
    const rec = meta.tomb[id];
    if (rec && (!rec.r || rec.t > rec.r)) {
      meta.tomb[id] = { t: rec.t, r: now };
    }
  });

  // 消失的 id -> 标记删除
  for (const id of prevMap.keys()) {
    if (!nextIds.has(id)) {
      const rec = meta.tomb[id];
      meta.tomb[id] = rec ? { t: now, r: rec.r } : { t: now };
    }
  }

  return meta;
}
