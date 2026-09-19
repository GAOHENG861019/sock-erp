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

const MENU_KEY = "sock-erp-visible-menu";
const FULL_MENU = ["/", "/today", "/fanwa", "/fengtou", "/dingxing", "/development", "/consulting"];

beforeEach(() => {
  cloudTable = {};
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("字符串数组配置（菜单/快速新增）的同步", () => {
  it("云端为字符串数组时，拉取到本地仍是字符串数组，不被当成条目数组", async () => {
    cloudTable[MENU_KEY] = {
      storage_key: MENU_KEY,
      data: ["/today", "/fanwa"],
      updated_at: "2026-09-19T10:00:00.000Z",
      device_id: "device-other",
    };
    const cs = await freshCloudStorage();
    await cs.init();
    await new Promise((r) => setTimeout(r, 30));

    const local = JSON.parse(localStorage.getItem(MENU_KEY) as string);
    expect(Array.isArray(local)).toBe(true);
    expect(local).toEqual(["/today", "/fanwa"]);
    // 字符串路径不应被错误写入条目元数据
    const entriesMeta = JSON.parse(localStorage.getItem("sock-erp-sync-entries") || "{}");
    expect(entriesMeta[MENU_KEY]).toBeUndefined();
  });

  it("本地写入完整菜单时云端整份保留，不被条目合并削减成首项", async () => {
    // 云端另一设备只有一个菜单项（字符串数组）
    cloudTable[MENU_KEY] = {
      storage_key: MENU_KEY,
      data: ["/today"],
      updated_at: "2026-09-19T10:00:00.000Z",
      device_id: "device-other",
    };
    const cs = await freshCloudStorage();
    await cs.init();
    await new Promise((r) => setTimeout(r, 30));

    // 本设备写入完整菜单
    cs.setItem(MENU_KEY, JSON.stringify(FULL_MENU));
    await cs.forceSync();

    const cloudData = cloudTable[MENU_KEY].data;
    expect(Array.isArray(cloudData)).toBe(true);
    expect(cloudData).toEqual(FULL_MENU);
    // 本地也不应被条目合并回写破坏
    const local = JSON.parse(localStorage.getItem(MENU_KEY) as string);
    expect(local).toEqual(FULL_MENU);
  });

  it("用户自定义隐藏部分菜单后，云端按 LWW 保留该自定义（不被条目合并改动）", async () => {
    // 云端初始为完整菜单
    cloudTable[MENU_KEY] = {
      storage_key: MENU_KEY,
      data: FULL_MENU,
      updated_at: "2026-09-19T10:00:00.000Z",
      device_id: "device-other",
    };
    const cs = await freshCloudStorage();
    await cs.init();
    await new Promise((r) => setTimeout(r, 30));

    // 用户隐藏了"本月总览"，本地只剩 19 项
    const customized = FULL_MENU.filter((x) => x !== "/today");
    cs.setItem(MENU_KEY, JSON.stringify(customized));
    await cs.forceSync();

    const cloudData = cloudTable[MENU_KEY].data;
    expect(Array.isArray(cloudData)).toBe(true);
    expect(cloudData).toEqual(customized);
    expect(cloudData).not.toContain("/today");
  });

  it("带 id 的业务对象数组仍正常走条目级合并（回归保护）", async () => {
    const KEY = "sock-erp-raw-materials";
    cloudTable[KEY] = {
      storage_key: KEY,
      data: [{ id: "1700000000001-a", name: "棉纱" }],
      updated_at: "2026-09-19T10:00:00.000Z",
      device_id: "device-other",
    };
    const cs = await freshCloudStorage();
    await cs.init();
    cs.setItem(
      KEY,
      JSON.stringify([
        { id: "1700000000001-a", name: "棉纱" },
        { id: "1700000000002-b", name: "橡筋" },
      ]),
    );
    await cs.forceSync();
    const ids = (cloudTable[KEY].data as Array<{ id: string }>).map((x) => x.id).sort();
    expect(ids).toEqual(["1700000000001-a", "1700000000002-b"]);
  });
});
