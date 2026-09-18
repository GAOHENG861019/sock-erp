import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExpenseRecordPage } from "../../src/pages/ExpensePages";
import { FitnessPage } from "../../src/pages/FitnessPage";
import { readFileSync } from "fs";
import { resolve } from "path";

beforeEach(() => {
  window.localStorage.clear();
});

describe("支出管理姓名字段", () => {
  describe("机器损耗/运货运费", () => {
    it("录入表单包含姓名输入框", () => {
      render(<ExpenseRecordPage eyebrow="支出管理" title="机器损耗" description="测试" module="dashboard" storageKey="sock-erp-machine-loss" />);
      const nameInput = document.querySelector('input[placeholder*="姓名"]') as HTMLInputElement;
      expect(nameInput).not.toBeNull();
    });

    it("支出明细表格包含姓名列", () => {
      window.localStorage.setItem("sock-erp-machine-loss", JSON.stringify([
        { id: "1", date: "2026-09-12", name: "张三", amount: 100, note: "换针" }
      ]));
      render(<ExpenseRecordPage eyebrow="支出管理" title="机器损耗" description="测试" module="dashboard" storageKey="sock-erp-machine-loss" />);
      const table = document.querySelector(".prod-table");
      expect(table).not.toBeNull();
      const headers = table!.querySelectorAll("th");
      const headerTexts = Array.from(headers).map((h) => h.textContent);
      expect(headerTexts).toContain("姓名");
    });

    it("显示支出记录中的姓名", () => {
      window.localStorage.setItem("sock-erp-machine-loss", JSON.stringify([
        { id: "1", date: "2026-09-12", name: "李四", amount: 200, note: "维修" }
      ]));
      render(<ExpenseRecordPage eyebrow="支出管理" title="机器损耗" description="测试" module="dashboard" storageKey="sock-erp-machine-loss" />);
      expect(screen.getByText("李四")).toBeInTheDocument();
    });

    it("ExpenseItem类型包含name字段", () => {
      const code = readFileSync(resolve(__dirname, "../../src/pages/ExpensePages.tsx"), "utf-8");
      expect(code).toContain("name: string");
    });

    it("录入表单描述包含姓名", () => {
      render(<ExpenseRecordPage eyebrow="支出管理" title="运货运费" description="测试" module="dashboard" storageKey="sock-erp-freight" />);
      const text = document.body.textContent || "";
      expect(text).toContain("姓名");
    });
  });

  describe("原材料采购", () => {
    it("RawMaterial类型包含payer字段", () => {
      const code = readFileSync(resolve(__dirname, "../../src/pages/FitnessPage.tsx"), "utf-8");
      expect(code).toContain("payer?: string");
    });

    it("添加原材料弹窗包含采购人输入框", () => {
      render(<FitnessPage />);
      fireEvent.click(screen.getByRole("button", { name: /添加原材料/ }));
      const modal = screen.getByRole("dialog");
      expect(modal).not.toBeNull();
      const payerInput = modal.querySelector('input[placeholder*="谁采购"]') as HTMLInputElement;
      expect(payerInput).not.toBeNull();
    });

    it("原材料表格包含采购人列", () => {
      window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
        { id: "1", name: "棉纱", spec: "32支", weight: 50, unitPrice: 25, amount: 2500, packages: 2, payer: "王五" }
      ]));
      render(<FitnessPage />);
      const table = document.querySelector(".prod-table");
      expect(table).not.toBeNull();
      const headers = table!.querySelectorAll("th");
      const headerTexts = Array.from(headers).map((h) => h.textContent);
      expect(headerTexts).toContain("采购人");
    });

    it("显示原材料记录中的采购人", () => {
      window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
        { id: "1", name: "棉纱", spec: "32支", weight: 50, unitPrice: 25, amount: 2500, packages: 2, payer: "赵六" }
      ]));
      render(<FitnessPage />);
      expect(screen.getByText("赵六")).toBeInTheDocument();
    });
  });
});
