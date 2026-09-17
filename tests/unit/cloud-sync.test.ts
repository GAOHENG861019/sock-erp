import { describe, it, expect } from "vitest";
import { repairPollutedArray } from "../../src/sync";

describe("云同步数组污染修复 repairPollutedArray", () => {
  it("把被 _cloud_updated_at 污染的数组对象还原为数组", () => {
    // 模拟旧版 bug：对数组做 { ...arr, _cloud_updated_at } 展开后的结果
    const polluted = {
      0: { id: "a", name: "棉纱" },
      1: { id: "b", name: "橡筋" },
      _cloud_updated_at: "2026-09-17T10:00:00.000Z",
    };
    const fixed = repairPollutedArray(polluted);
    expect(Array.isArray(fixed)).toBe(true);
    expect(fixed).toEqual([
      { id: "a", name: "棉纱" },
      { id: "b", name: "橡筋" },
    ]);
  });

  it("还原只有一条记录的污染数组", () => {
    const polluted = {
      0: { id: "only", amount: 100 },
      _cloud_updated_at: "2026-09-17T10:00:00.000Z",
    };
    const fixed = repairPollutedArray(polluted);
    expect(Array.isArray(fixed)).toBe(true);
    expect(fixed).toHaveLength(1);
    expect((fixed as any[])[0].id).toBe("only");
  });

  it("正常数组原样返回（保持引用）", () => {
    const arr = [
      { id: "a", name: "棉纱" },
      { id: "b", name: "橡筋" },
    ];
    expect(repairPollutedArray(arr)).toBe(arr);
  });

  it("空数组原样返回", () => {
    const arr: unknown[] = [];
    expect(repairPollutedArray(arr)).toBe(arr);
  });

  it("普通业务对象（非数字键）不被误判为数组", () => {
    const obj = { appearance: "light", theme: "notebook" };
    const fixed = repairPollutedArray(obj);
    expect(Array.isArray(fixed)).toBe(false);
    expect(fixed).toEqual(obj);
  });

  it("数字键不连续的对象不还原（避免破坏真实对象）", () => {
    // 缺少键 1，不能认定为数组
    const obj = { 0: "a", 2: "c", _cloud_updated_at: "x" };
    const fixed = repairPollutedArray(obj);
    expect(Array.isArray(fixed)).toBe(false);
  });

  it("数字键对象若混入非 meta 业务字段则不还原", () => {
    // 除了 _cloud_updated_at 还混入了别的字段，可能是真实对象，不能贸然转数组
    const obj = { 0: "a", 1: "b", name: "可疑字段" };
    const fixed = repairPollutedArray(obj);
    expect(Array.isArray(fixed)).toBe(false);
  });

  it("原始值（字符串/数字/null/undefined）原样返回", () => {
    expect(repairPollutedArray("hello")).toBe("hello");
    expect(repairPollutedArray(123)).toBe(123);
    expect(repairPollutedArray(null)).toBe(null);
    expect(repairPollutedArray(undefined)).toBe(undefined);
  });

  it("还原后数组元素顺序与数字键顺序一致", () => {
    const polluted = {
      2: { id: "c" },
      0: { id: "a" },
      1: { id: "b" },
      _cloud_updated_at: "2026-09-17T10:00:00.000Z",
    };
    const fixed = repairPollutedArray(polluted) as any[];
    expect(fixed.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});
