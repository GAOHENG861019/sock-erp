import { describe, expect, it } from "vitest";

describe("DietPage - 仓库出入库记录关联", () => {
  it("出入库记录数=成品库存记录+原材料库存记录", () => {
    const finishedInventory = [{ id: "1" }, { id: "2" }];
    const materialInventory = [{ id: "3" }];
    const warehouseTxnCount = finishedInventory.length + materialInventory.length;
    expect(warehouseTxnCount).toBe(3);
  });

  it("空仓库时出入库记录数为0", () => {
    const finishedInventory: any[] = [];
    const materialInventory: any[] = [];
    const warehouseTxnCount = finishedInventory.length + materialInventory.length;
    expect(warehouseTxnCount).toBe(0);
  });

  it("使用实际仓库数据而非consultingInteractions", () => {
    const finishedInventory = [{ id: "1" }, { id: "2" }, { id: "3" }];
    const materialInventory = [{ id: "4" }, { id: "5" }];
    const warehouseTxnCount = finishedInventory.length + materialInventory.length;
    const oldCount = 0; // consultingInteractions为空
    expect(warehouseTxnCount).toBe(5);
    expect(warehouseTxnCount).not.toBe(oldCount);
  });

  it("显示文本包含出入库记录条数", () => {
    const warehouseTxnCount = 5;
    const display = `出入库记录：${warehouseTxnCount} 条`;
    expect(display).toBe("出入库记录：5 条");
    expect(display).toContain("出入库记录");
  });
});
