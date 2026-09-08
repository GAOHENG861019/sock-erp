import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ExpenseRecordPage } from "../../src/pages/ExpensePages";

beforeEach(() => {
  window.localStorage.clear();
});

function renderExpense(title: string, key: string) {
  return render(<ExpenseRecordPage eyebrow="测试" title={title} description="测试" module="entertainment" storageKey={key} />);
}

describe("支出记录-增删功能", () => {
  it("添加记录成功", () => {
    renderExpense("机器损耗", "test-machine");
    fireEvent.change(screen.getByPlaceholderText("金额"), { target: { value: "100" } });
    fireEvent.change(screen.getByPlaceholderText("备注"), { target: { value: "维修电机" } });
    fireEvent.click(screen.getByText("添加", { selector: "button" }));

    const text = document.body.textContent || "";
    expect(text).toContain("维修电机");
    expect(text).toContain("¥100.00");
  });

  it("删除记录成功", () => {
    window.localStorage.setItem("test-machine", JSON.stringify([
      { id: "1", date: "2024-01-01", amount: 200, note: "测试删除" },
    ]));
    renderExpense("机器损耗", "test-machine");

    expect(screen.getByText("测试删除")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("删除"));
    expect(screen.queryByText("测试删除")).not.toBeInTheDocument();
    expect(screen.getByText("还没有支出记录")).toBeInTheDocument();
  });

  it("多条记录合计正确", () => {
    window.localStorage.setItem("test-freight", JSON.stringify([
      { id: "1", date: "2024-01-01", amount: 50, note: "发货A" },
      { id: "2", date: "2024-01-02", amount: 80, note: "发货B" },
    ]));
    renderExpense("运货运费", "test-freight");
    expect(screen.getByText(/支出合计/)).toHaveTextContent("¥130.00");
  });

  it("空金额不能添加", () => {
    renderExpense("工资支出", "test-salary");
    fireEvent.click(screen.getByText("添加", { selector: "button" }));
    expect(screen.getByText("还没有支出记录")).toBeInTheDocument();
  });

  it("显示添加记录按钮", () => {
    renderExpense("机器损耗", "test-machine");
    expect(screen.getByText("添加记录")).toBeInTheDocument();
  });

  it("数据持久化到localStorage", () => {
    window.localStorage.setItem("test-salary", JSON.stringify([
      { id: "1", date: "2024-01-01", amount: 5000, note: "1月工资" },
    ]));
    renderExpense("工资支出", "test-salary");
    const text = document.body.textContent || "";
    expect(text).toContain("1月工资");
    expect(text).toContain("¥5000.00");
  });
});
