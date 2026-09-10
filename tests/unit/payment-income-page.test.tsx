import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaymentIncomePage } from "../../src/pages/ExpensePages";

beforeEach(() => {
  window.localStorage.clear();
});

describe("货款收入页面", () => {
  it("渲染页面标题", () => {
    render(<PaymentIncomePage />);
    expect(screen.getByText("货款收入")).toBeInTheDocument();
    expect(screen.getByText("添加收入")).toBeInTheDocument();
  });

  it("显示收入录入表单", () => {
    render(<PaymentIncomePage />);
    expect(screen.getByPlaceholderText("客户名称")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("备注")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("金额")).toBeInTheDocument();
  });

  it("添加收入记录成功", () => {
    render(<PaymentIncomePage />);
    fireEvent.change(screen.getByPlaceholderText("客户名称"), { target: { value: "张三客户" } });
    fireEvent.change(screen.getByPlaceholderText("金额"), { target: { value: "5000" } });
    fireEvent.click(screen.getAllByText("添加")[0]);
    expect(screen.getByText("张三客户")).toBeInTheDocument();
    expect(screen.getAllByText("¥5000.00").length).toBeGreaterThan(0);
  });

  it("收入合计显示正确", () => {
    window.localStorage.setItem("sock-erp-payment-income", JSON.stringify([
      { id: "1", date: "2024-01-01", customer: "客户A", amount: 1000, note: "" },
      { id: "2", date: "2024-01-02", customer: "客户B", amount: 2000, note: "" },
    ]));
    render(<PaymentIncomePage />);
    const text = document.body.textContent || "";
    expect(text).toContain("收入合计");
    expect(text).toContain("¥3000.00");
  });

  it("删除收入记录成功", () => {
    window.localStorage.setItem("sock-erp-payment-income", JSON.stringify([
      { id: "1", date: "2024-01-01", customer: "客户A", amount: 1000, note: "" },
    ]));
    render(<PaymentIncomePage />);
    expect(screen.getByText("客户A")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("删除"));
    expect(screen.queryByText("客户A")).not.toBeInTheDocument();
  });

  it("空状态显示提示", () => {
    render(<PaymentIncomePage />);
    expect(screen.getByText("还没有收入记录")).toBeInTheDocument();
  });
});
