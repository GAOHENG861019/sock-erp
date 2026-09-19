import { describe, it, expect } from "vitest";
import {
  emptyEntryMeta,
  itemCreatedAt,
  isItemArray,
  mergeEntriesMeta,
  mergeItemArrays,
  computeMetaAfterLocalWrite,
  isItemDeleted,
} from "../../src/sync-merge";

const item = (id: string, extra: Record<string, unknown> = {}) => ({ id, ...extra });

describe("itemCreatedAt", () => {
  it("从纯数字开头 id 提取时间戳", () => {
    expect(itemCreatedAt(item("1789721521315-kjuct8"))).toBe(1789721521315);
  });
  it("从带前缀 id 提取时间戳", () => {
    expect(itemCreatedAt(item("cat_1789721521315_abc"))).toBe(1789721521315);
    expect(itemCreatedAt(item("inv_1789721521315_xyz"))).toBe(1789721521315);
  });
  it("无法提取时返回 0", () => {
    expect(itemCreatedAt(item("abc"))).toBe(0);
    expect(itemCreatedAt(null)).toBe(0);
  });
});

describe("isItemArray", () => {
  it("元素都是带 id 对象时为 true", () => {
    expect(isItemArray([item("a"), item("b")])).toBe(true);
  });
  it("空数组为 false", () => {
    expect(isItemArray([])).toBe(false);
  });
  it("基础类型数组为 false", () => {
    expect(isItemArray(["a", "b"])).toBe(false);
  });
});

describe("mergeEntriesMeta", () => {
  it("合并两台设备各自新增的 rev", () => {
    const local = { k: { rev: { a: 100 }, tomb: {} } };
    const cloud = { k: { rev: { b: 200 }, tomb: {} } };
    const merged = mergeEntriesMeta(local, cloud);
    expect(merged.k.rev).toEqual({ a: 100, b: 200 });
  });

  it("同一条目 rev 取较大值", () => {
    const local = { k: { rev: { a: 100 }, tomb: {} } };
    const cloud = { k: { rev: { a: 300 }, tomb: {} } };
    expect(mergeEntriesMeta(local, cloud).k.rev.a).toBe(300);
  });

  it("合并墓碑，删除与恢复时间取较大值", () => {
    const local = { k: { rev: {}, tomb: { a: { t: 100 } } } };
    const cloud = { k: { rev: {}, tomb: { b: { t: 200 }, a: { t: 100, r: 150 } } } };
    const merged = mergeEntriesMeta(local, cloud);
    expect(merged.k.tomb.a).toEqual({ t: 100, r: 150 });
    expect(merged.k.tomb.b).toEqual({ t: 200 });
  });

  it("保留本地独有的 key", () => {
    const local = { k1: { rev: { a: 1 }, tomb: {} } };
    const cloud = { k2: { rev: { b: 2 }, tomb: {} } };
    const merged = mergeEntriesMeta(local, cloud);
    expect(merged.k1).toBeDefined();
    expect(merged.k2).toBeDefined();
  });
});

describe("mergeItemArrays", () => {
  it("两台设备各自新增的条目都保留（核心：互不覆盖）", () => {
    const local = [item("a", { name: "A" })];
    const cloud = [item("b", { name: "B" })];
    const merged = mergeItemArrays(local, cloud, emptyEntryMeta(), emptyEntryMeta());
    const ids = merged.map((i) => i.id).sort();
    expect(ids).toEqual(["a", "b"]);
  });

  it("相同 id 按 rev 取最新版本", () => {
    const local = [item("a", { v: "old" })];
    const cloud = [item("a", { v: "new" })];
    const localMeta = { rev: { a: 100 }, tomb: {} };
    const cloudMeta = { rev: { a: 300 }, tomb: {} };
    const merged = mergeItemArrays(local, cloud, localMeta, cloudMeta);
    expect(merged).toHaveLength(1);
    expect((merged[0] as any).v).toBe("new");
  });

  it("云端删除的条目（墓碑）在合并结果中剔除", () => {
    const local = [item("a"), item("b")];
    const cloud = [item("b")]; // 云端已删除 a
    const cloudMeta = { rev: {}, tomb: { a: { t: 300 } } };
    const merged = mergeItemArrays(local, cloud, emptyEntryMeta(), cloudMeta);
    expect(merged.map((i) => i.id)).toEqual(["b"]);
  });

  it("恢复（r 晚于 t）的条目重新出现", () => {
    const local = [item("a"), item("b")];
    const cloud = [item("a"), item("b")];
    const cloudMeta = { rev: { a: 500 }, tomb: { a: { t: 300, r: 400 } } };
    const merged = mergeItemArrays(local, cloud, emptyEntryMeta(), cloudMeta);
    expect(merged.map((i) => i.id)).toContain("a");
  });

  it("本地新增、云端没有的条目保留", () => {
    const local = [item("a"), item("b")];
    const cloud: Array<Record<string, unknown>> = [];
    const merged = mergeItemArrays(local, cloud, emptyEntryMeta(), emptyEntryMeta());
    expect(merged.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("相同 id 且都无 rev 时保守保留本地版本（不丢本地编辑）", () => {
    const local = [item("1789721521315-z", { v: "local" })];
    const cloud = [item("1789721521315-z", { v: "cloud" })];
    const merged = mergeItemArrays(local, cloud, emptyEntryMeta(), emptyEntryMeta());
    expect(merged).toHaveLength(1);
    expect((merged[0] as any).v).toBe("local");
  });

  it("不同 id 且无 rev 时按 id 时间戳并存（各自新增互不丢失）", () => {
    const local = [item("1700000000000-x", { v: "old" })];
    const cloud = [item("1789721521315-y", { v: "new" })];
    const merged = mergeItemArrays(local, cloud, emptyEntryMeta(), emptyEntryMeta());
    expect(merged.map((i) => i.id).sort()).toEqual(["1700000000000-x", "1789721521315-y"]);
  });
});

describe("computeMetaAfterLocalWrite", () => {
  it("新增条目写入 rev", () => {
    const next = [item("a")];
    const meta = computeMetaAfterLocalWrite(null, next, emptyEntryMeta(), 1000);
    expect(meta.rev.a).toBe(1000);
  });

  it("编辑过的条目更新 rev", () => {
    const prev = [item("a", { v: 1 })];
    const next = [item("a", { v: 2 })];
    const meta = computeMetaAfterLocalWrite(prev, next, { rev: { a: 100 }, tomb: {} }, 500);
    expect(meta.rev.a).toBe(500);
  });

  it("删除的条目写入墓碑 t", () => {
    const prev = [item("a"), item("b")];
    const next = [item("b")];
    const meta = computeMetaAfterLocalWrite(prev, next, emptyEntryMeta(), 900);
    expect(meta.tomb.a).toEqual({ t: 900 });
    expect(isItemDeleted(meta, "a")).toBe(true);
  });

  it("恢复曾删除的条目写入 r（晚于 t）", () => {
    const prev = [item("b")]; // a 之前被删除
    const next = [item("a"), item("b")]; // a 恢复
    const prevMeta = { rev: {}, tomb: { a: { t: 100 } } };
    const meta = computeMetaAfterLocalWrite(prev, next, prevMeta, 900);
    expect(meta.tomb.a).toEqual({ t: 100, r: 900 });
    expect(isItemDeleted(meta, "a")).toBe(false);
  });

  it("未变化的条目不更新 rev", () => {
    const prev = [item("a", { v: 1 })];
    const next = [item("a", { v: 1 })];
    const meta = computeMetaAfterLocalWrite(prev, next, { rev: { a: 100 }, tomb: {} }, 900);
    expect(meta.rev.a).toBe(100);
  });
});
