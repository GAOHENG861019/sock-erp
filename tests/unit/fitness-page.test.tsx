import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { FitnessPage } from "../../src/pages/FitnessPage";

beforeEach(() => {
  window.localStorage.clear();
});

describe("原材料采购", () => {
  it("显示公斤单位和单价列", () => {
    window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
      { id: "1", name: "棉纱", spec: "32支", weight: 50, unitPrice: 25, amount: 2500, packages: 2 }
    ]));
    render(<FitnessPage />);
    const text = document.body.textContent || "";
    expect(text).toContain("单重(公斤)");
    expect(text).toContain("总重量(公斤)");
    expect(text).toContain("单价(元/公斤)");
    expect(text).toContain("50 公斤");
    // 总重量 = 2包 * 50公斤 = 100公斤
    expect(text).toContain("100.00 公斤");
    expect(text).toContain("¥25.00/公斤");
    // 金额 = 2 * 50 * 25 = 2500
    expect(text).toContain("¥2500.00");
  });

  it("总重量=包数×重量，金额=包数×重量×单价", () => {
    window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
      { id: "1", name: "棉纱", spec: "32支", weight: 50, unitPrice: 20, amount: 2000, packages: 2 },
      { id: "2", name: "橡筋", spec: "宽", weight: 30, unitPrice: 15, amount: 1350, packages: 3 },
    ]));
    render(<FitnessPage />);
    const text = document.body.textContent || "";
    // 总重量 = 2*50 + 3*30 = 100 + 90 = 190公斤
    expect(text).toContain("190.00 公斤");
    // 总额 = 2000 + 1350 = 3350
    expect(text).toContain("¥3350.00");
    // 总包数 = 2 + 3 = 5
    expect(text).toContain("5 包");
  });

  it("无数据时显示空状态", () => {
    render(<FitnessPage />);
    expect(screen.getByText("还没有原材料")).toBeInTheDocument();
  });

  it("添加原材料按钮存在", () => {
    render(<FitnessPage />);
    expect(screen.getByText("添加原材料")).toBeInTheDocument();
  });

  it("原材料总额度显示", () => {
    window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
      { id: "1", name: "棉纱", spec: "32支", weight: 10, unitPrice: 30, amount: 300 },
    ]));
    render(<FitnessPage />);
    const text = document.body.textContent || "";
    expect(text).toContain("原材料总额度");
    expect(text).toContain("¥300.00");
  });

  it("原材料包数显示和统计", () => {
    window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
      { id: "1", name: "棉纱", spec: "32支", weight: 10, unitPrice: 30, amount: 300, packages: 5 },
      { id: "2", name: "橡筋", spec: "40支", weight: 5, unitPrice: 20, amount: 100, packages: 3 },
    ]));
    render(<FitnessPage />);
    const text = document.body.textContent || "";
    expect(text).toContain("总包数");
    expect(text).toContain("8");
    expect(text).toContain("5 包");
    expect(text).toContain("3 包");
  });

  it("添加原材料弹窗包含包数字段", () => {
    render(<FitnessPage />);
    fireEvent.click(screen.getByText("添加原材料"));
    const modal = screen.getByRole("dialog");
    expect(within(modal).getByText("包数")).toBeInTheDocument();
  });

  it("原材料支持编辑修改", () => {
    window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
      { id: "1", name: "棉纱", spec: "32支", weight: 10, unitPrice: 30, amount: 300, packages: 5 },
    ]));
    render(<FitnessPage />);
    // 点击编辑按钮
    fireEvent.click(screen.getByTitle("编辑"));
    const modal = screen.getByRole("dialog");
    expect(within(modal).getByText("编辑原材料")).toBeInTheDocument();
    // 修改名称
    const nameInput = within(modal).getByDisplayValue("棉纱");
    fireEvent.change(nameInput, { target: { value: "棉纱2" } });
    fireEvent.click(within(modal).getByText("保存"));
    expect(screen.getByText("棉纱2")).toBeInTheDocument();
  });
});
