import { describe, it, expect, beforeEach, vi } from "vitest";

// ===== 模拟云端 app_data 表（支持链式 select/eq/maybeSingle/upsert/delete）=====
type Row = { storage_key: string; data: unknown; updated_at: string; device_id: string | null };
let cloudTable: Record<string, Row> = {};

function projectRow(r: Row, cols: string): Partial<Row> {
  if (cols === "*") return r;
  const out: Record<string, unknown> = {};
  cols
    .split(",")
    .map((s) => s.trim())
    .forEach((c) => {
      out[c] = (r as Record<string, unknown>)[c];
    });
  return out;
}

function makeQuery() {
  let cols = "*";
  const filters: Array<[string, unknown]> = [];
  let isDelete = false;
  const q: any = {
    select(c: string) {
      cols = c;
      return q;
    },
    eq(c: string, v: unknown) {
      filters.push([c, v]);
      return q;
    },
    delete() {
      isDelete = true;
      return q;
    },
    async upsert(row: Row) {
      cloudTable[row.storage_key] = {
        ...cloudTable[row.storage_key],
        ...row,
      };
      return { error: null };
    },
    async maybeSingle() {
      const rows = matchRows();
      return { data: rows[0] ? projectRow(rows[0], cols) : null, error: null };
    },
  };

  function matchRows(): Row[] {
    return Object.values(cloudTable).filter((r) =>
      filters.every(([c, v]) => (r as Record<string, unknown>)[c] === v),
    );
  }

  q.then = (onFulfilled: (v: unknown) => unknown) => {
    let result: unknown;
    if (isDelete) {
      matchRows().forEach((r) => delete cloudTable[r.storage_key]);
      result = { error: null };
    } else {
      result = { data: matchRows().map((r) => projectRow(r, cols)), error: null };
    }
    return Promise.resolve(result).then(onFulfilled);
  };
  return q;
}

vi.mock("../../src/supabase", () => ({
  SUPABASE_CONFIG: { url: "https://example.supabase.co", enabled: true },
  supabase: {
    from: () => makeQuery(),
    channel: () => {
      const ch: any = {};
      ch.on = () => ch;
      ch.subscribe = () => ch;
      return ch;
    },
  },
}));

async function freshCloudStorage() {
  vi.resetModules();
  const mod = await import("../../src/sync");
  return mod.cloudStorage;
}

const ITEM_KEY = "sock-erp-raw-materials";
const OBJ_KEY = "sock-erp-settings";
const PENDING_KEY = "sock-erp-sync-pending";
const readCloud = (key: string) => {
  const row = cloudTable[key];
  return row ? row.data : undefined;
};
const cloudItemIds = () => ((readCloud(ITEM_KEY) as any[]) || []).map((x) => x.id).sort();

beforeEach(() => {
  cloudTable = {};
  window.localStorage.clear();
  vi.clearAllTimers?.();
});

describe("防抖窗口内刷新 / 关闭后，重启补传（修复删除/新增复活）", () => {
  it("删除条目后不等待防抖立即刷新，重启 init 后删除仍传播到云端（不复活）", async () => {
    // 云端基线：[a,b]
    let cs = await freshCloudStorage();
    await cs.init();
    cs.setItem(
      ITEM_KEY,
      JSON.stringify([
        { id: "1700000000001-a", name: "A" },
        { id: "1700000000002-b", name: "B" },
      ]),
    );
    await cs.forceSync();
    expect(cloudItemIds()).toEqual(["1700000000001-a", "1700000000002-b"]);

    // 同一台设备：删除 b（仅剩 a），但不等待防抖上传，模拟「立即刷新」
    cs.setItem(ITEM_KEY, JSON.stringify([{ id: "1700000000001-a", name: "A" }]));
    // 待上传标记已持久化
    expect(JSON.parse(localStorage.getItem(PENDING_KEY) || "{}")[ITEM_KEY]).toBe("put");
    // 刷新：内存定时器与队列被销毁，但 localStorage（含删除后的数组、墓碑、待上传标记）保留
    vi.clearAllTimers();
    cs = await freshCloudStorage();
    await cs.init();

    // 云端必须收敛为只有 a，b 不能复活
    expect(cloudItemIds()).toEqual(["1700000000001-a"]);
    // 补传成功后待上传标记应清除
    expect(JSON.parse(localStorage.getItem(PENDING_KEY) || "{}")[ITEM_KEY]).toBeUndefined();
  });

  it("新增条目后立即刷新，重启 init 后新增也同步到云端（不丢失）", async () => {
    let cs = await freshCloudStorage();
    await cs.init();
    cs.setItem(ITEM_KEY, JSON.stringify([{ id: "1700000000001-a", name: "A" }]));
    await cs.forceSync();

    // 离线式新增 b，不等待防抖，立即刷新
    cs.setItem(
      ITEM_KEY,
      JSON.stringify([
        { id: "1700000000001-a", name: "A" },
        { id: "1700000000002-b", name: "B" },
      ]),
    );
    vi.clearAllTimers();
    cs = await freshCloudStorage();
    await cs.init();

    expect(cloudItemIds()).toEqual(["1700000000001-a", "1700000000002-b"]);
  });

  it("对象类设置在防抖窗口内刷新，重启 init 后补传，不回退为云端旧值", async () => {
    let cs = await freshCloudStorage();
    await cs.init();
    cs.setItem(OBJ_KEY, JSON.stringify({ theme: "light" }));
    await cs.forceSync();
    expect(readCloud(OBJ_KEY)).toEqual({ theme: "light" });

    // 本地改成 dark，不等待防抖立即刷新
    cs.setItem(OBJ_KEY, JSON.stringify({ theme: "dark" }));
    vi.clearAllTimers();
    cs = await freshCloudStorage();
    await cs.init();

    expect(readCloud(OBJ_KEY)).toEqual({ theme: "dark" });
  });

  it("整份删除（removeItem）在防抖窗口内刷新，重启 init 后云端行也被删除", async () => {
    let cs = await freshCloudStorage();
    await cs.init();
    cs.setItem(OBJ_KEY, JSON.stringify({ theme: "light" }));
    await cs.forceSync();
    expect(readCloud(OBJ_KEY)).toEqual({ theme: "light" });

    // 本地删除整份，不等待防抖立即刷新
    cs.removeItem(OBJ_KEY);
    expect(JSON.parse(localStorage.getItem(PENDING_KEY) || "{}")[OBJ_KEY]).toBe("del");
    vi.clearAllTimers();
    cs = await freshCloudStorage();
    await cs.init();

    expect(readCloud(OBJ_KEY)).toBeUndefined();
  });

  it("本地与云端一致（无领先变更）时，启动不会产生多余回写", async () => {
    let cs = await freshCloudStorage();
    await cs.init();
    cs.setItem(ITEM_KEY, JSON.stringify([{ id: "1700000000001-a", name: "A" }]));
    await cs.forceSync();
    const updatedAtBefore = cloudTable[ITEM_KEY].updated_at;

    // 等待一小段确保时间戳不同，然后全新设备拉取（无本地变更）
    await new Promise((r) => setTimeout(r, 2));
    vi.clearAllTimers();
    localStorage.clear();
    cs = await freshCloudStorage();
    await cs.init();

    // 全新设备没有本地领先删除/新增，业务行不应被改写
    expect(cloudTable[ITEM_KEY].updated_at).toBe(updatedAtBefore);
    expect(cloudItemIds()).toEqual(["1700000000001-a"]);
  });
});
