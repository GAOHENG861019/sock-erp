import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { WarehousePage } from "../../src/pages/WarehousePage";

function seedDingxing() {
  window.localStorage.setItem("sock-erp-dingxing", JSON.stringify([
    { id: "dx1", name: "张三", color: "白色", spec: "双", quantity: 100, unitPrice: 5 },
    { id: "dx2", name: "李四", color: "黑色", spec: "包", quantity: 50, unitPrice: 10 },
  ]));
}

function seedRawMaterials() {
  window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
    { id: "rm1", name: "3075纱线", spec: "18D", weight: 1, unitPrice: 20, amount: 20 },
  ]));
}

function seedFinishedInventory() {
  window.localStorage.setItem("sock-erp-finished-inventory", JSON.stringify([
    { id: "fi1", linkedId: "dx1", quantity: 10, note: "首批" },
    { id: "fi2", linkedId: "dx2", quantity: 5, note: "" },
  ]));
}

function seedMaterialInventory() {
  window.localStorage.setItem("sock-erp-material-inventory", JSON.stringify([
    { id: "mi1", linkedId: "rm1", quantity: 2.5, note: "入库" },
  ]));
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("仓库管理页面", () => {
  it("渲染页面标题", () => {
    render(<WarehousePage />);
    expect(screen.getByRole("heading", { name: "仓库管理", level: 1 })).toBeInTheDocument();
  });

  it("显示两个标签页", () => {
    render(<WarehousePage />);
    expect(screen.getByRole("tab", { name: /成品库存/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /原材料库存/ })).toBeInTheDocument();
  });

  it("数量单位显示公斤", () => {
    render(<WarehousePage />);
    expect(document.body.textContent).toContain("公斤");
  });

  it("成品库存显示关联定型数据和公斤单位", () => {
    seedDingxing();
    seedFinishedInventory();
    render(<WarehousePage />);
    const text = document.body.textContent || "";
    expect(text).toContain("白色");
    expect(text).toContain("10 公斤");
    expect(text).toContain("首批");
  });

  it("成品库存金额计算正确", () => {
    seedDingxing();
    seedFinishedInventory();
    render(<WarehousePage />);
    // dx1: 10 * 5 = 50, dx2: 5 * 10 = 50, total = 100
    const text = document.body.textContent || "";
    expect(text).toContain("¥50.00");
    expect(text).toContain("¥100.00");
  });

  it("原材料库存显示关联采购数据和公斤单位", () => {
    seedRawMaterials();
    seedMaterialInventory();
    render(<WarehousePage />);
    fireEvent.click(screen.getByRole("tab", { name: /原材料库存/ }));
    const text = document.body.textContent || "";
    expect(text).toContain("3075纱线");
    expect(text).toContain("2.5 公斤");
    expect(text).toContain("入库");
  });

  it("原材料库存金额计算正确", () => {
    seedRawMaterials();
    seedMaterialInventory();
    render(<WarehousePage />);
    fireEvent.click(screen.getByRole("tab", { name: /原材料库存/ }));
    // 2.5 * 20 = 50
    expect(document.body.textContent).toContain("¥50.00");
  });

  it("空状态显示提示", () => {
    render(<WarehousePage />);
    expect(screen.getByText("暂无成品库存")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /原材料库存/ }));
    expect(screen.getByText("暂无原材料库存")).toBeInTheDocument();
  });

  it("添加成品库存弹窗显示关联定型下拉", () => {
    seedDingxing();
    render(<WarehousePage />);
    fireEvent.click(screen.getByRole("button", { name: /添加成品库存/ }));
    const modal = screen.getByRole("dialog");
    expect(within(modal).getByRole("combobox")).toBeInTheDocument();
    expect(document.body.textContent).toContain("库存数量(公斤)");
  });

  it("删除成品库存成功", () => {
    seedDingxing();
    seedFinishedInventory();
    render(<WarehousePage />);
    const deleteBtns = screen.getAllByLabelText("删除");
    fireEvent.click(deleteBtns[0]);
    const dialogs = screen.getAllByRole("dialog");
    const confirmDialog = dialogs[dialogs.length - 1];
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "删除" }));
    // 剩下1条
    expect(screen.getAllByLabelText("删除").length).toBe(1);
  });

  it("数据持久化到localStorage", () => {
    seedDingxing();
    seedFinishedInventory();
    render(<WarehousePage />);
    const saved = JSON.parse(window.localStorage.getItem("sock-erp-finished-inventory") || "[]");
    expect(saved.length).toBe(2);
    expect(saved[0].quantity).toBe(10);
  });

  it("成品总数量显示公斤", () => {
    seedDingxing();
    seedFinishedInventory();
    render(<WarehousePage />);
    // 10 + 5 = 15 公斤
    expect(document.body.textContent).toContain("15 公斤");
  });
});
