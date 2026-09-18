import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ProductionRecordPage, DingxingPage } from "../../src/pages/ProductionRecordPage";

function renderFanwa() {
  return render(<ProductionRecordPage eyebrow="生产工序" title="翻袜" description="测试" module="today" storageKey="test-fanwa" />);
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("生产记录-按包计算", () => {
  it("翻袜录入框根据规格显示单位", () => {
    renderFanwa();
    // 默认规格是包
    expect(screen.getByPlaceholderText("数量(包)")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("单价(元/包)")).toBeInTheDocument();
  });

  it("翻袜记录显示数量和单价（统一按包）", () => {
    window.localStorage.setItem("test-fanwa", JSON.stringify([
      { id: "1", name: "张三", spec: "包", quantity: 10, unitPrice: 5 },
      { id: "2", name: "张三", spec: "包", quantity: 3, unitPrice: 50 },
    ]));
    renderFanwa();
    const text = document.body.textContent || "";
    expect(text).toContain("10 包");
    expect(text).toContain("¥5.00/包");
    expect(text).toContain("3 包");
    expect(text).toContain("¥50.00/包");
  });

  it("翻袜小计按姓名汇总", () => {
    window.localStorage.setItem("test-fanwa", JSON.stringify([
      { id: "1", name: "李四", spec: "包", quantity: 20, unitPrice: 3 },
      { id: "2", name: "李四", spec: "包", quantity: 5, unitPrice: 30 },
    ]));
    renderFanwa();
    const text = document.body.textContent || "";
    // 小计数量 = 20 + 5 = 25 包
    expect(text).toContain("25包");
    // 小计金额 = 20*3 + 5*30 = 60 + 150 = 210
    expect(text).toContain("¥210.00");
  });

  it("翻袜总数量汇总", () => {
    window.localStorage.setItem("test-fanwa", JSON.stringify([
      { id: "1", name: "甲", spec: "包", quantity: 10, unitPrice: 5 },
      { id: "2", name: "乙", spec: "包", quantity: 15, unitPrice: 4 },
      { id: "3", name: "丙", spec: "包", quantity: 8, unitPrice: 40 },
    ]));
    renderFanwa();
    const text = document.body.textContent || "";
    // 总数量 = 10 + 15 + 8 = 33 包
    expect(text).toContain("33包");
    // 总金额 = 10*5 + 15*4 + 8*40 = 50 + 60 + 320 = 430
    expect(text).toContain("¥430.00");
  });

  it("翻袜编辑记录功能", () => {
    window.localStorage.setItem("test-fanwa", JSON.stringify([
      { id: "1", name: "张三", spec: "包", quantity: 10, unitPrice: 5 },
    ]));
    renderFanwa();
    const editBtns = screen.getAllByTitle("编辑");
    fireEvent.click(editBtns[0]);
    expect(screen.getByText("编辑记录")).toBeInTheDocument();
    // 在弹窗内找到数量输入框并修改
    const modal = screen.getByRole("dialog");
    const inputs = within(modal).getAllByRole("spinbutton");
    fireEvent.change(inputs[0], { target: { value: "20" } });
    fireEvent.click(screen.getByText("保存修改"));
    const text = document.body.textContent || "";
    expect(text).toContain("20 包");
  });

  it("翻袜删除记录功能", () => {
    window.localStorage.setItem("test-fanwa", JSON.stringify([
      { id: "1", name: "待删", spec: "包", quantity: 10, unitPrice: 5 },
    ]));
    renderFanwa();
    let text = document.body.textContent || "";
    expect(text).toContain("待删");
    const delBtns = screen.getAllByTitle("删除");
    fireEvent.click(delBtns[0]);
    text = document.body.textContent || "";
    expect(text).not.toContain("待删");
    expect(screen.getByText("还没有记录")).toBeInTheDocument();
  });

  it("定型按颜色显示和编辑", () => {
    window.localStorage.setItem("sock-erp-dingxing", JSON.stringify([
      { id: "1", name: "王五", color: "白色", spec: "包", quantity: 15, unitPrice: 4 },
      { id: "2", name: "赵六", color: "白色", spec: "包", quantity: 2, unitPrice: 60 },
    ]));
    render(<DingxingPage module="development" />);
    const text = document.body.textContent || "";
    expect(text).toContain("15 包");
    expect(text).toContain("¥4.00/包");
    expect(text).toContain("2 包");
    expect(text).toContain("¥60.00/包");
    // 颜色小计 = 15 + 2 = 17 包
    expect(text).toContain("17包");
  });

  it("定型编辑记录功能", () => {
    window.localStorage.setItem("sock-erp-dingxing", JSON.stringify([
      { id: "1", name: "王五", color: "白色", spec: "包", quantity: 15, unitPrice: 4 },
    ]));
    render(<DingxingPage module="development" />);
    const editBtns = screen.getAllByTitle("编辑");
    fireEvent.click(editBtns[0]);
    expect(screen.getByText("编辑定型记录")).toBeInTheDocument();
    const modal = screen.getByRole("dialog");
    const inputs = within(modal).getAllByRole("spinbutton");
    fireEvent.change(inputs[0], { target: { value: "30" } });
    fireEvent.click(screen.getByText("保存修改"));
    const text = document.body.textContent || "";
    expect(text).toContain("30 包");
  });

  it("定型删除记录功能", () => {
    window.localStorage.setItem("sock-erp-dingxing", JSON.stringify([
      { id: "1", name: "待删", color: "白色", spec: "包", quantity: 10, unitPrice: 5 },
    ]));
    render(<DingxingPage module="development" />);
    expect(screen.getByText("待删")).toBeInTheDocument();
    const delBtns = screen.getAllByTitle("删除");
    fireEvent.click(delBtns[0]);
    expect(screen.queryByText("待删")).not.toBeInTheDocument();
  });
});
