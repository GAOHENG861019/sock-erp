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
    { id: "fi1", linkedId: "dx1", quantity: 10, note: "首批", type: "in", date: "2024-01-01" },
    { id: "fi2", linkedId: "dx2", quantity: 5, note: "", type: "in", date: "2024-01-02" },
    { id: "fi3", linkedId: "dx1", quantity: 3, note: "出货", type: "out", date: "2024-01-03" },
  ]));
}

function seedMaterialInventory() {
  window.localStorage.setItem("sock-erp-material-inventory", JSON.stringify([
    { id: "mi1", linkedId: "rm1", quantity: 2.5, note: "入库", type: "in", date: "2024-01-01" },
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

  it("显示入库和出库按钮", () => {
    render(<WarehousePage />);
    expect(screen.getByRole("button", { name: /入库/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /出库/ })).toBeInTheDocument();
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

  it("成品库存按颜色显示余量", () => {
    seedDingxing();
    seedFinishedInventory();
    render(<WarehousePage />);
    const text = document.body.textContent || "";
    // 白色: 10入 - 3出 = 7包
    expect(text).toContain("白色");
    expect(text).toContain("7包");
    // 黑色: 5入 = 5包
    expect(text).toContain("黑色");
    expect(text).toContain("5包");
  });

  it("入库出库记录显示类型标签", () => {
    seedDingxing();
    seedFinishedInventory();
    render(<WarehousePage />);
    const text = document.body.textContent || "";
    expect(text).toContain("入库");
    expect(text).toContain("出库");
  });

  it("成品库存金额计算正确", () => {
    seedDingxing();
    seedFinishedInventory();
    render(<WarehousePage />);
    const text = document.body.textContent || "";
    // dx1: 10 * 5 = 50, dx2: 5 * 10 = 50
    expect(text).toContain("¥50.00");
  });

  it("原材料库存显示关联采购数据和公斤单位", () => {
    seedRawMaterials();
    seedMaterialInventory();
    render(<WarehousePage />);
    fireEvent.click(screen.getByRole("tab", { name: /原材料库存/ }));
    const text = document.body.textContent || "";
    expect(text).toContain("3075纱线");
    expect(text).toContain("2.5 公斤");
  });

  it("空状态显示提示", () => {
    render(<WarehousePage />);
    expect(screen.getByText("暂无成品库存记录")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /原材料库存/ }));
    expect(screen.getByText("暂无原材料库存记录")).toBeInTheDocument();
  });

  it("点击入库打开弹窗", () => {
    seedDingxing();
    render(<WarehousePage />);
    fireEvent.click(screen.getByRole("button", { name: /入库/ }));
    const modal = screen.getByRole("dialog");
    expect(within(modal).getAllByRole("combobox").length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain("数量(包)");
  });

  it("点击出库打开弹窗并预选出库类型", () => {
    seedDingxing();
    render(<WarehousePage />);
    fireEvent.click(screen.getByRole("button", { name: /出库/ }));
    const modal = screen.getByRole("dialog");
    expect(within(modal).getByText("出库")).toBeInTheDocument();
  });

  it("删除库存记录成功", () => {
    seedDingxing();
    seedFinishedInventory();
    render(<WarehousePage />);
    const deleteBtns = screen.getAllByLabelText("删除");
    fireEvent.click(deleteBtns[0]);
    const dialogs = screen.getAllByRole("dialog");
    const confirmDialog = dialogs[dialogs.length - 1];
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "删除" }));
    expect(screen.getAllByLabelText("删除").length).toBe(2);
  });

  it("数据持久化到localStorage", () => {
    seedDingxing();
    seedFinishedInventory();
    render(<WarehousePage />);
    const saved = JSON.parse(window.localStorage.getItem("sock-erp-finished-inventory") || "[]");
    expect(saved.length).toBe(3);
    expect(saved[0].quantity).toBe(10);
    expect(saved[0].type).toBe("in");
  });

  it("当前总余量计算正确（入库减出库）", () => {
    seedDingxing();
    seedFinishedInventory();
    render(<WarehousePage />);
    // 10 + 5 - 3 = 12 包
    expect(document.body.textContent).toContain("12 包");
  });

  it("库存余量按颜色和规格分别显示", () => {
    seedDingxing();
    seedFinishedInventory();
    render(<WarehousePage />);
    const text = document.body.textContent || "";
    expect(text).toContain("按颜色和规格");
    // dx1: 白色-双, 入库10出库3 = 7包
    expect(text).toContain("白色");
    expect(text).toContain("7包");
    // dx2: 黑色-包, 入库5 = 5包
    expect(text).toContain("黑色");
    expect(text).toContain("5包");
  });

  it("出入库记录显示颜色和规格列", () => {
    seedDingxing();
    seedFinishedInventory();
    render(<WarehousePage />);
    const text = document.body.textContent || "";
    expect(text).toContain("颜色");
    expect(text).toContain("规格");
    expect(text).toContain("双");
    expect(text).toContain("包");
  });
});
