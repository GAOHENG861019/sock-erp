import { describe, it, expect, beforeEach, vi } from "vitest";

// 模拟云端 app_data 表的存储
let cloudTable: Record<string, { storage_key: string; data: unknown; updated_at: string; device_id: string | null }> = {};

vi.mock("../../src/supabase", () => {
  const chain = {
    select: vi.fn(async () => ({ data: Object.values(cloudTable), error: null })),
    upsert: vi.fn(async (row: any) => {
      cloudTable[row.storage_key] = { ...cloudTable[row.storage_key], ...row };
      return { error: null };
    }),
    delete: vi.fn(() => ({
      eq: vi.fn(async () => ({ error: null })),
    })),
    eq: vi.fn(async () => ({ error: null })),
  };
  return {
    SUPABASE_CONFIG: { url: "https://example.supabase.co", enabled: true },
    supabase: {
      from: vi.fn(() => chain),
      channel: vi.fn(() => ({
        on: vi.fn(() => ({ subscribe: vi.fn() })),
        subscribe: vi.fn(),
      })),
    },
  };
});

// 每个用例都重新加载 sync 模块，确保 init 的单次初始化标志重置
async function freshCloudStorage() {
  vi.resetModules();
  const mod = await import("../../src/sync");
  return mod.cloudStorage;
}

beforeEach(() => {
  cloudTable = {};
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("云同步合并流程（mock Supabase）", () => {
  it("从云端拉取的数组数据在本地仍是数组，不被污染成对象", async () => {
    cloudTable["sock-erp-raw-materials"] = {
      storage_key: "sock-erp-raw-materials",
      data: [
        { id: "m1", name: "棉纱", amount: 1000 },
        { id: "m2", name: "橡筋", amount: 500 },
      ],
      updated_at: "2026-09-17T10:00:00.000Z",
      device_id: "device-other",
    };

    const cloudStorage = await freshCloudStorage();
    await cloudStorage.init();
    await new Promise((r) => setTimeout(r, 50));

    const raw = window.localStorage.getItem("sock-erp-raw-materials");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    // 业务数据里不应被注入时间戳字段
    expect(parsed[0]).not.toHaveProperty("_cloud_updated_at");
    expect(parsed[1]).not.toHaveProperty("_cloud_updated_at");
  });

  it("时间戳存放在独立 meta，不写入业务数据", async () => {
    cloudTable["sock-erp-fanwa"] = {
      storage_key: "sock-erp-fanwa",
      data: [{ id: "f1", name: "张三", packages: 10 }],
      updated_at: "2026-09-17T11:00:00.000Z",
      device_id: "device-other",
    };

    const cloudStorage = await freshCloudStorage();
    await cloudStorage.init();
    await new Promise((r) => setTimeout(r, 50));

    const fanwa = JSON.parse(window.localStorage.getItem("sock-erp-fanwa") as string);
    expect(Array.isArray(fanwa)).toBe(true);
    expect(fanwa[0]).not.toHaveProperty("_cloud_updated_at");

    const meta = JSON.parse(window.localStorage.getItem("sock-erp-sync-meta") as string);
    expect(meta["sock-erp-fanwa"]).toBe("2026-09-17T11:00:00.000Z");
  });

  it("本地已被旧版污染的数组在初始化时被还原", async () => {
    // 模拟旧版 bug 已经污染了本地数据
    window.localStorage.setItem(
      "sock-erp-fengtou",
      JSON.stringify({
        0: { id: "ft1", name: "李四" },
        1: { id: "ft2", name: "王五" },
        _cloud_updated_at: "2026-09-16T00:00:00.000Z",
      }),
    );

    const cloudStorage = await freshCloudStorage();
    await cloudStorage.init();
    await new Promise((r) => setTimeout(r, 50));

    const fixed = JSON.parse(window.localStorage.getItem("sock-erp-fengtou") as string);
    expect(Array.isArray(fixed)).toBe(true);
    expect(fixed).toHaveLength(2);
    expect(fixed[0].id).toBe("ft1");
    expect(fixed[1].id).toBe("ft2");
  });
});
