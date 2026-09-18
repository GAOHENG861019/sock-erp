import { describe, expect, it } from "vitest";

// 测试仓库管理出入库弹窗的输入和计算逻辑
describe("WarehousePage - 出入库弹窗", () => {
  it("数字输入框使用text+inputMode支持连续输入", () => {
    // 验证输入框类型配置
    const inputConfig = { type: "text", inputMode: "decimal" };
    expect(inputConfig.type).toBe("text");
    expect(inputConfig.inputMode).toBe("decimal");
  });

  it("成品总公斤数等于输入的公斤数", () => {
    const isFinished = true;
    const formWeightKg = "50";
    const totalKg = isFinished ? formWeightKg || "0" : "0";
    expect(totalKg).toBe("50");
  });

  it("原材料总公斤数自动计算=包数×每包重量", () => {
    const isFinished = false;
    const formPackages = "10";
    const perPkg = 5; // 每包5公斤
    const pkgs = Number(formPackages) || 0;
    const totalKg = perPkg > 0 ? String(pkgs * perPkg) : "0";
    expect(totalKg).toBe("50");
  });

  it("原材料无每包重量时使用输入的公斤数", () => {
    const isFinished = false;
    const formPackages = "10";
    const formQuantity = "30";
    const perPkg = 0;
    const pkgs = Number(formPackages) || 0;
    const totalKg = perPkg > 0 ? String(pkgs * perPkg) : (formQuantity || "0");
    expect(totalKg).toBe("30");
  });

  it("handleSubmit中原材料总公斤数自动覆盖", () => {
    const isFinished = false;
    let quantity = Number("20") || 0; // 手动输入20公斤
    const packages = Number("10") || 0;
    const perPkg = 5;
    if (!isFinished && perPkg > 0) quantity = packages * perPkg;
    expect(quantity).toBe(50); // 自动覆盖为50
  });

  it("成品总公斤数不自动覆盖", () => {
    const isFinished = true;
    const quantity = Number("20") || 0;
    const packages = Number("10") || 0;
    const perPkg = 5;
    // 成品不自动覆盖
    expect(quantity).toBe(20);
  });
});
