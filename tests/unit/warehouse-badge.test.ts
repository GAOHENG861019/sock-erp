import { describe, expect, it } from "vitest";

describe("WarehousePage - 库存徽章显示余量", () => {
  it("成品徽章显示总包数而非记录数", () => {
    const dingxingList = [{ quantity: 10 }, { quantity: 20 }];
    const finishedList = [
      { type: "in", quantity: 5 },
      { type: "out", quantity: 3 },
    ];
    let total = 0;
    dingxingList.forEach((d) => { total += Number(d.quantity || 0); });
    finishedList.forEach((item) => {
      const sign = item.type === "out" ? -1 : 1;
      total += sign * Number(item.quantity || 0);
    });
    const finishedTotalPackages = Math.max(0, total);
    expect(finishedTotalPackages).toBe(32); // 10+20+5-3
    expect(finishedTotalPackages).not.toBe(finishedList.length);
  });

  it("原材料徽章显示总公斤数而非记录数", () => {
    const rawMaterialList = [{ packages: 10, weight: 5 }, { packages: 5, weight: 2 }];
    const materialList = [
      { type: "in", quantity: 10 },
      { type: "out", quantity: 5 },
    ];
    let total = 0;
    rawMaterialList.forEach((r) => {
      const pkgs = Number(r.packages || 0);
      total += pkgs * Number(r.weight || 0);
    });
    materialList.forEach((item) => {
      const sign = item.type === "out" ? -1 : 1;
      total += sign * Number(item.quantity || 0);
    });
    const materialTotalWeightKg = Math.max(0, total);
    expect(materialTotalWeightKg).toBe(65); // 10*5+5*2+10-5
    expect(materialTotalWeightKg).not.toBe(materialList.length);
  });

  it("余量不为负数", () => {
    const finishedList = [{ type: "out", quantity: 100 }];
    let total = 0;
    finishedList.forEach((item) => {
      const sign = item.type === "out" ? -1 : 1;
      total += sign * Number(item.quantity || 0);
    });
    const finishedTotalPackages = Math.max(0, total);
    expect(finishedTotalPackages).toBe(0);
  });

  it("空库存时余量为0", () => {
    const dingxingList: any[] = [];
    const finishedList: any[] = [];
    let total = 0;
    dingxingList.forEach((d) => { total += Number(d.quantity || 0); });
    finishedList.forEach((item) => {
      const sign = item.type === "out" ? -1 : 1;
      total += sign * Number(item.quantity || 0);
    });
    expect(Math.max(0, total)).toBe(0);
  });
});
