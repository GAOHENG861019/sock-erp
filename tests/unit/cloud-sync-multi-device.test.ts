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

  // thenable：await 查询时执行（全量/过滤查询或删除）
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

function snapshotLS(): Record<string, string> {
  const o: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) as string;
    o[k] = localStorage.getItem(k) as string;
  }
  return o;
}
function restoreLS(o: Record<string, string>) {
  localStorage.clear();
  Object.entries(o).forEach(([k, v]) => localStorage.setItem(k, v));
}

const KEY = "sock-erp-raw-materials";
const readLocal = (): any[] => JSON.parse(localStorage.getItem(KEY) || "[]");
const readCloud = (): any[] => {
  const row = cloudTable[KEY];
  return row ? (row.data as any[]) : [];
};
const cloudIds = () => readCloud().map((x) => x.id).sort();

beforeEach(() => {
  cloudTable = {};
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("多设备条目级云同步（mock Supabase）", () => {
  it("两台设备先后新增不同条目，同步后都不丢失", async () => {
    // 设备 A：新增 a 并同步
    let cs = await freshCloudStorage();
    await cs.init();
    cs.setItem(KEY, JSON.stringify([{ id: "1700000000001-a", name: "棉纱A" }]));
    await cs.forceSync();
    expect(cloudIds()).toEqual(["1700000000001-a"]);

    // 设备 B：全新设备，拉到 a，再新增 b 并同步
    localStorage.clear();
    cs = await freshCloudStorage();
    await cs.init();
    expect(readLocal().map((x) => x.id)).toEqual(["1700000000001-a"]);
    cs.setItem(
      KEY,
      JSON.stringify([
        { id: "1700000000001-a", name: "棉纱A" },
        { id: "1700000000002-b", name: "棉纱B" },
      ]),
    );
    await cs.forceSync();
    expect(cloudIds()).toEqual(["1700000000001-a", "1700000000002-b"]);

    // 设备 A 重新打开拉取，应同时看到 a 和 b
    localStorage.clear();
    cs = await freshCloudStorage();
    await cs.init();
    expect(readLocal().map((x) => x.id).sort()).toEqual(["1700000000001-a", "1700000000002-b"]);
  });

  it("两台设备离线并发新增不同条目，合并后两者都保留（核心：互不覆盖）", async () => {
    // 共同基线：云端只有 a
    let cs = await freshCloudStorage();
    await cs.init();
    cs.setItem(KEY, JSON.stringify([{ id: "1700000000001-a", name: "A" }]));
    await cs.forceSync();

    // 设备 B 拉到基线 [a]，离线新增 b，保存其本地快照（暂不同步）
    localStorage.clear();
    cs = await freshCloudStorage();
    await cs.init();
    cs.setItem(
      KEY,
      JSON.stringify([
        { id: "1700000000001-a", name: "A" },
        { id: "1700000000002-b", name: "B" },
      ]),
    );
    const snapshotB = snapshotLS();

    // 设备 A 同样基于 [a]，离线新增 c 并先同步 → 云端 [a,c]
    localStorage.clear();
    cs = await freshCloudStorage();
    await cs.init();
    cs.setItem(
      KEY,
      JSON.stringify([
        { id: "1700000000001-a", name: "A" },
        { id: "1700000000003-c", name: "C" },
      ]),
    );
    await cs.forceSync();
    expect(cloudIds()).toEqual(["1700000000001-a", "1700000000003-c"]);

    // 设备 B 恢复上线：本地 [a,b] 与云端 [a,c] 合并，必须得到 a,b,c
    restoreLS(snapshotB);
    cs = await freshCloudStorage();
    await cs.init();
    // init 已把云端 c 合并进来；本地 b 不应被覆盖丢失
    expect(readLocal().map((x) => x.id).sort()).toEqual([
      "1700000000001-a",
      "1700000000002-b",
      "1700000000003-c",
    ]);

    // B 再同步，云端最终收敛为 a,b,c
    cs.setItem(KEY, JSON.stringify(readLocal()));
    await cs.forceSync();
    expect(cloudIds()).toEqual([
      "1700000000001-a",
      "1700000000002-b",
      "1700000000003-c",
    ]);
  });

  it("一台设备删除的条目，通过墓碑在另一台设备不复活，且保留对方新增", async () => {
    // 基线：云端 [a,b]
    let cs = await freshCloudStorage();
    await cs.init();
    cs.setItem(
      KEY,
      JSON.stringify([
        { id: "1700000000001-a", name: "A" },
        { id: "1700000000002-b", name: "B" },
      ]),
    );
    await cs.forceSync();

    // 设备 B 拉到 [a,b]，保存快照（模拟它离线）
    localStorage.clear();
    cs = await freshCloudStorage();
    await cs.init();
    expect(readLocal().map((x) => x.id).sort()).toEqual(["1700000000001-a", "1700000000002-b"]);
    const snapshotB = snapshotLS();

    // 设备 A 删除 b（仅剩 a）并同步
    localStorage.clear();
    cs = await freshCloudStorage();
    await cs.init();
    cs.setItem(KEY, JSON.stringify([{ id: "1700000000001-a", name: "A" }]));
    await cs.forceSync();
    expect(cloudIds()).toEqual(["1700000000001-a"]);

    // 设备 B 恢复（本地仍有 b），并新增 c
    restoreLS(snapshotB);
    cs = await freshCloudStorage();
    await cs.init();
    // 云端删除 b（墓碑），本地 b 应被剔除
    expect(readLocal().map((x) => x.id)).not.toContain("1700000000002-b");
    // B 新增 c
    const localAfterPull = readLocal();
    localAfterPull.push({ id: "1700000000003-c", name: "C" });
    cs.setItem(KEY, JSON.stringify(localAfterPull));
    await cs.forceSync();

    // 最终：a 保留、b 已删除不复活、c 保留
    expect(cloudIds().sort()).toEqual(["1700000000001-a", "1700000000003-c"]);
  });
});
