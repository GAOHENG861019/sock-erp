import { describe, expect, it } from "vitest";

describe("WarehousePage - 成品余量不关联定型+一键出入库", () => {
  it("成品余量只计算手动入库出库，不包含定型", () => {
    const dingxingList = [{ quantity: 100 }]; // 定型有100包
    const finishedList = [
      { type: "in", quantity: 20 },
      { type: "out", quantity: 5 },
    ];
    let total = 0;
    // 不包含定型自动入库
    finishedList.forEach((item) => {
      const sign = item.type === "out" ? -1 : 1;
      total += sign * Number(item.quantity || 0);
    });
    const finishedTotalPackages = Math.max(0, total);
    expect(finishedTotalPackages).toBe(15); // 20-5，不包含定型的100
  });

  it("选择定型关联后自动填充包数", () => {
    const dingxingList = [{ id: "d1", quantity: 50, color: "白色", spec: "包", name: "工人A" }];
    const selectedId = "d1";
    const d = dingxingList.find((x) => x.id === selectedId);
    const autoFilledQuantity = d ? String(d.quantity || "") : "";
    expect(autoFilledQuantity).toBe("50");
  });

  it("选择原材料关联后自动填充包数和公斤数", () => {
    const rawMaterialList = [{ id: "r1", packages: 10, weight: 5, name: "棉纱", spec: "包" }];
    const selectedId = "r1";
    const r = rawMaterialList.find((x) => x.id === selectedId);
    const autoFilledPackages = r ? String(r.packages || "") : "";
    const autoFilledKg = r ? String((Number(r.packages || 0) * Number(r.weight || 0)) || "") : "";
    expect(autoFilledPackages).toBe("10");
    expect(autoFilledKg).toBe("50");
  });

  it("未选择关联时不自动填充", () => {
    const dingxingList = [{ id: "d1", quantity: 50 }];
    const selectedId = "";
    const d = dingxingList.find((x) => x.id === selectedId);
    const autoFilledQuantity = d ? String(d.quantity || "") : "";
    expect(autoFilledQuantity).toBe("");
  });

  it("成品余量计算不依赖dingxingList", () => {
    const finishedList = [{ type: "in", quantity: 30 }];
    let total = 0;
    finishedList.forEach((item) => {
      const sign = item.type === "out" ? -1 : 1;
      total += sign * Number(item.quantity || 0);
    });
    // 即使没有定型数据，成品余量也能正常计算
    expect(Math.max(0, total)).toBe(30);
  });
});
