import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExpenseStatsPage } from "../../src/pages/ExpensePages";

beforeEach(() => {
  window.localStorage.clear();
});

describe("支出统计-包含原材料", () => {
  it("显示四类支出占比标题", () => {
    render(<ExpenseStatsPage />);
    expect(screen.getByText("四类支出占比")).toBeInTheDocument();
  });

  it("原材料采购费用计入总计", () => {
    window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
      { id: "1", name: "棉纱", spec: "32支", weight: 100, unitPrice: 25, amount: 2500 },
      { id: "2", name: "橡筋", spec: "宽", weight: 50, unitPrice: 15, amount: 750 },
    ]));
    render(<ExpenseStatsPage />);
    const text = document.body.textContent || "";
    expect(text).toContain("原材料采购");
    expect(text).toContain("¥3250.00");
    expect(text).toContain("支出总计");
  });

  it("四类支出占比正确计算", () => {
    window.localStorage.setItem("sock-erp-machine-loss", JSON.stringify([
      { id: "1", date: "2024-01-15", amount: 500, note: "维修" },
    ]));
    window.localStorage.setItem("sock-erp-freight", JSON.stringify([
      { id: "1", date: "2024-01-16", amount: 300, note: "发货" },
    ]));
    window.localStorage.setItem("sock-erp-salary", JSON.stringify([
      { id: "1", date: "2024-01-17", amount: 2000, note: "工资" },
    ]));
    window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
      { id: "1", name: "棉纱", spec: "", weight: 10, unitPrice: 20, amount: 200 },
    ]));
    render(<ExpenseStatsPage />);
    const text = document.body.textContent || "";
    // 总计 = 500 + 300 + 2000 + 200 = 3000
    expect(text).toContain("¥3000.00");
    // 原材料占比 = 200/3000 = 6.7%
    expect(text).toContain("6.7%");
  });

  it("原材料明细出现在支出列表中", () => {
    window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
      { id: "1", name: "棉纱", spec: "32支", weight: 100, unitPrice: 25, amount: 2500 },
    ]));
    render(<ExpenseStatsPage />);
    const text = document.body.textContent || "";
    expect(text).toContain("棉纱");
    expect(text).toContain("32支");
    expect(text).toContain("无日期");
  });

  it("无数据时显示空状态", () => {
    render(<ExpenseStatsPage />);
    expect(screen.getByText("筛选范围内没有收支记录")).toBeInTheDocument();
  });

  it("导出CSV按钮存在", () => {
    render(<ExpenseStatsPage />);
    expect(screen.getByText("导出CSV")).toBeInTheDocument();
  });

  it("工资支出关联生产记录（翻袜缝头定型金额计入工资）", () => {
    window.localStorage.setItem("sock-erp-fanwa", JSON.stringify([
      { id: "1", name: "张三", spec: "包", quantity: 10, unitPrice: 5, date: "2024-01-15" },
    ]));
    window.localStorage.setItem("sock-erp-fengtou", JSON.stringify([
      { id: "1", name: "李四", spec: "包", quantity: 5, unitPrice: 3, date: "2024-01-15" },
    ]));
    window.localStorage.setItem("sock-erp-salary", JSON.stringify([
      { id: "1", date: "2024-01-17", amount: 100, note: "奖金" },
    ]));
    render(<ExpenseStatsPage />);
    const text = document.body.textContent || "";
    // 工资 = 翻袜50 + 缝头15 + 额外100 = 165
    expect(text).toContain("¥165.00");
    expect(text).toContain("翻袜-张三");
    expect(text).toContain("缝头-李四");
  });
});
