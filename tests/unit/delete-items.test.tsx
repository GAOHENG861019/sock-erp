import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProductionRecordPage, DingxingPage } from "../../src/pages/ProductionRecordPage";
import { ExpenseRecordPage, PaymentIncomePage } from "../../src/pages/ExpensePages";
import { FitnessPage } from "../../src/pages/FitnessPage";
import { SalesOrderPage } from "../../src/pages/SalesOrderPage";

beforeEach(() => {
  window.localStorage.clear();
});

describe("所有添加项可自由删除", () => {
  it("翻袜/缝头页面代码包含删除功能", () => {
    const fs = require("fs");
    const code = fs.readFileSync("src/pages/ProductionRecordPage.tsx", "utf-8");
    expect(code).toContain("removeItem");
    expect(code).toContain("title=\"删除\"");
    expect(code).toContain("Trash");
  });

  it("定型记录可删除", () => {
    window.localStorage.setItem("sock-erp-dingxing", JSON.stringify([
      { id: "1", name: "王五", color: "白色", spec: "包", quantity: 30, unitPrice: 1.0, date: "2026-09-12" }
    ]));
    render(<DingxingPage module="dashboard" />);
    expect(screen.getByText("王五")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("删除"));
    expect(screen.queryByText("王五")).not.toBeInTheDocument();
  });

  it("机器损耗记录可删除", () => {
    window.localStorage.setItem("sock-erp-machine-loss", JSON.stringify([
      { id: "1", date: "2026-09-12", amount: 100, note: "换针" }
    ]));
    render(<ExpenseRecordPage eyebrow="支出管理" title="机器损耗" description="测试" module="dashboard" storageKey="sock-erp-machine-loss" />);
    expect(screen.getByText("换针")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("删除"));
    expect(screen.queryByText("换针")).not.toBeInTheDocument();
  });

  it("运货运费记录可删除", () => {
    window.localStorage.setItem("sock-erp-freight", JSON.stringify([
      { id: "1", date: "2026-09-12", amount: 50, note: "发货运费" }
    ]));
    render(<ExpenseRecordPage eyebrow="支出管理" title="运货运费" description="测试" module="dashboard" storageKey="sock-erp-freight" />);
    expect(screen.getByText("发货运费")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("删除"));
    expect(screen.queryByText("发货运费")).not.toBeInTheDocument();
  });

  it("货款收入记录可删除", () => {
    window.localStorage.setItem("sock-erp-payment-income", JSON.stringify([
      { id: "1", date: "2026-09-12", customer: "客户A", amount: 500, note: "货款" }
    ]));
    render(<PaymentIncomePage />);
    expect(screen.getByText("客户A")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("删除"));
    expect(screen.queryByText("客户A")).not.toBeInTheDocument();
  });

  it("原材料可删除", () => {
    window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
      { id: "1", name: "棉纱", spec: "32支", weight: 50, unitPrice: 25, amount: 2500, packages: 2 }
    ]));
    render(<FitnessPage />);
    expect(screen.getByText("棉纱")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("删除"));
    expect(screen.queryByText("棉纱")).not.toBeInTheDocument();
  });

  it("销货单记录可删除", () => {
    window.localStorage.setItem("sock-erp-sales-order", JSON.stringify([
      { id: "1", customer: "客户B", color: "白色", spec: "包", quantity: 20, unitPrice: 5 }
    ]));
    render(<SalesOrderPage />);
    expect(screen.getByText("客户B")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("删除"));
    expect(screen.queryByText("客户B")).not.toBeInTheDocument();
  });

  it("分类中心代码包含删除功能", () => {
    const fs = require("fs");
    const code = fs.readFileSync("src/pages/CategoryPage.tsx", "utf-8");
    expect(code).toContain("setDeleteTarget");
    expect(code).toContain("ConfirmDialog");
    expect(code).toContain("删除分类");
    expect(code).toContain("Trash");
  });

  it("会员管理代码包含删除功能", () => {
    const fs = require("fs");
    const code = fs.readFileSync("src/pages/MemberPage.tsx", "utf-8");
    expect(code).toContain("setDeleteTarget");
    expect(code).toContain("ConfirmDialog");
    expect(code).toContain("删除会员");
    expect(code).toContain("Trash");
  });

  it("仓库管理代码包含删除功能", () => {
    const fs = require("fs");
    const code = fs.readFileSync("src/pages/WarehousePage.tsx", "utf-8");
    expect(code).toContain("setDeleteTarget");
    expect(code).toContain("ConfirmDialog");
    expect(code).toContain("删除库存记录");
    expect(code).toContain("Trash");
  });

  it("工资支出代码包含删除功能", () => {
    const fs = require("fs");
    const code = fs.readFileSync("src/pages/SalaryPage.tsx", "utf-8");
    expect(code).toContain("removeExtra");
    expect(code).toContain("Trash");
  });

  it("客户中心代码包含删除功能", () => {
    const fs = require("fs");
    const code = fs.readFileSync("src/pages/ConsultingPage.tsx", "utf-8");
    expect(code).toContain("setDeleteTarget");
    expect(code).toContain("删除客户");
    expect(code).toContain("Trash");
  });
});
