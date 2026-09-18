import { describe, it, expect, beforeEach, vi } from "vitest";

// 模拟云端 app_data 表
let cloudTable: Record<string, { storage_key: string; data: unknown; updated_at: string; device_id: string | null }> = {};

vi.mock("../../src/supabase", () => {
  const chain = {
    select: vi.fn(async () => ({ data: Object.values(cloudTable), error: null })),
    upsert: vi.fn(async (row: any) => {
      cloudTable[row.storage_key] = { ...cloudTable[row.storage_key], ...row };
      return { error: null };
    }),
    delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
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

async function freshCloudStorage() {
  vi.resetModules();
  const mod = await import("../../src/sync");
  const prefs = await import("../../src/ui-preferences");
  return { cloudStorage: mod.cloudStorage, prefs };
}

beforeEach(() => {
  cloudTable = {};
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("云同步拉取界面偏好", () => {
  it("初始化拉取到其他设备的界面偏好后，派发变更事件通知界面刷新", async () => {
    cloudTable["sock-erp-ui-preferences"] = {
      storage_key: "sock-erp-ui-preferences",
      data: { appearance: "neo", theme: "dark" },
      updated_at: "2026-09-18T10:00:00.000Z",
      device_id: "device-other",
    };

    let heard = 0;
    const handler = () => { heard += 1; };
    window.addEventListener("sock-erp-ui-prefs-changed", handler);

    const { cloudStorage, prefs } = await freshCloudStorage();
    await cloudStorage.init();
    await new Promise((r) => setTimeout(r, 50));

    window.removeEventListener("sock-erp-ui-prefs-changed", handler);

    // 偏好已写入本地
    expect(prefs.readUiPreferences()).toEqual({ appearance: "neo", theme: "dark" });
    // 派发了变更事件，WorkspaceContext 据此重新计算
    expect(heard).toBeGreaterThanOrEqual(1);
  });

  it("云端没有界面偏好时，不派发变更事件", async () => {
    cloudTable["sock-erp-fanwa"] = {
      storage_key: "sock-erp-fanwa",
      data: [{ id: "f1" }],
      updated_at: "2026-09-18T10:00:00.000Z",
      device_id: "device-other",
    };

    let heard = 0;
    const handler = () => { heard += 1; };
    window.addEventListener("sock-erp-ui-prefs-changed", handler);

    const { cloudStorage } = await freshCloudStorage();
    await cloudStorage.init();
    await new Promise((r) => setTimeout(r, 50));

    window.removeEventListener("sock-erp-ui-prefs-changed", handler);
    expect(heard).toBe(0);
  });
});
