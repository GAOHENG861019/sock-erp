import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { SalaryPage } from "../../src/pages/SalaryPage";

type FanwaItem = { id: string; name: string; spec: "包" | "双"; quantity: number; unitPrice: number };
type DingxingItem = FanwaItem & { color: string };
type ExtraItem = { id: string; name: string; amount: number; note: string; date: string };

function seedFanwa(items: FanwaItem[]) {
  window.localStorage.setItem("sock-erp-fanwa", JSON.stringify(items));
}
function seedFengtou(items: FanwaItem[]) {
  window.localStorage.setItem("sock-erp-fengtou", JSON.stringify(items));
}
function seedDingxing(items: DingxingItem[]) {
  window.localStorage.setItem("sock-erp-dingxing", JSON.stringify(items));
}
function seedExtras(items: ExtraItem[]) {
  window.localStorage.setItem("sock-erp-salary", JSON.stringify(items));
}

function addExtraViaModal(name: string, amount: string, note: string) {
  fireEvent.click(screen.getByRole("button", { name: /添加额外工资/ }));
  const modal = screen.getByRole("dialog");
  fireEvent.change(within(modal).getByPlaceholderText("员工姓名"), { target: { value: name } });
  fireEvent.change(within(modal).getByPlaceholderText("金额(元)"), { target: { value: amount } });
  fireEvent.change(within(modal).getByPlaceholderText("如：奖金、全勤补贴"), { target: { value: note } });
  fireEvent.click(within(modal).getByRole("button", { name: /保存并继续/ }));
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("工资支出页面", () => {
  it("1. 渲染页面标题『工资支出』及描述", () => {
    render(<SalaryPage />);
    expect(screen.getByRole("heading", { level: 1, name: "工资支出" })).toBeInTheDocument();
    expect(screen.getByText("关联翻袜、缝头、定型生产记录，按员工自动计算工资。点击姓名查看每人每天产量。")).toBeInTheDocument();
    expect(screen.getByText("人工成本")).toBeInTheDocument();
  });

  it("2. 无生产记录时显示空状态", () => {
    render(<SalaryPage />);
    expect(screen.getByText("暂无生产记录")).toBeInTheDocument();
    expect(screen.getByText("添加翻袜/缝头/定型记录后自动计算工资")).toBeInTheDocument();
  });

  it("3. seed 翻袜数据后，列表显示员工姓名和翻袜金额", () => {
    seedFanwa([{ id: "f1", name: "张三", spec: "双", quantity: 100, unitPrice: 0.5 }]);
    render(<SalaryPage />);
    const text = document.body.textContent || "";
    expect(text).toContain("张三");
    // 翻袜金额 = 100 * 0.5 = 50.00
    expect(text).toContain("¥50.00");
    expect(text).toContain("100双");
  });

  it("4. seed 翻袜+缝头+定型后，员工显示三个工序的数量和金额", () => {
    seedFanwa([{ id: "f1", name: "张三", spec: "双", quantity: 100, unitPrice: 0.5 }]);       // 50
    seedFengtou([{ id: "t1", name: "张三", spec: "双", quantity: 200, unitPrice: 0.3 }]);      // 60
    seedDingxing([{ id: "d1", name: "张三", color: "白色", spec: "包", quantity: 10, unitPrice: 10 }]); // 100
    render(<SalaryPage />);
    const text = document.body.textContent || "";
    // 翻袜 100双 ¥50.00
    expect(text).toContain("100双");
    expect(text).toContain("¥50.00");
    // 缝头 200双 ¥60.00
    expect(text).toContain("200双");
    expect(text).toContain("¥60.00");
    // 定型 10包 ¥100.00
    expect(text).toContain("10包");
    expect(text).toContain("¥100.00");
  });

  it("5. 工资合计 = 翻袜 + 缝头 + 定型金额之和", () => {
    seedFanwa([{ id: "f1", name: "张三", spec: "双", quantity: 100, unitPrice: 0.5 }]);       // 50
    seedFengtou([{ id: "t1", name: "张三", spec: "双", quantity: 200, unitPrice: 0.3 }]);      // 60
    seedDingxing([{ id: "d1", name: "张三", color: "白色", spec: "包", quantity: 10, unitPrice: 10 }]); // 100
    render(<SalaryPage />);
    // 合计 = 50 + 60 + 100 = 210.00
    expect(screen.getAllByText("¥210.00").length).toBeGreaterThan(0);
  });

  it("6. 数量按规格分别显示（双和包）", () => {
    seedFanwa([
      { id: "f1", name: "李四", spec: "双", quantity: 100, unitPrice: 0.5 },  // 50
      { id: "f2", name: "李四", spec: "包", quantity: 50, unitPrice: 1 },     // 50
    ]);
    render(<SalaryPage />);
    const text = document.body.textContent || "";
    expect(text).toContain("100双");
    expect(text).toContain("50包");
    expect(text).toContain("100双 + 50包");
  });

  it("7. 多个员工按工资合计降序排列", () => {
    seedFanwa([
      { id: "f1", name: "李四", spec: "双", quantity: 100, unitPrice: 0.1 },  // 10
      { id: "f2", name: "王五", spec: "双", quantity: 100, unitPrice: 0.9 },  // 90
    ]);
    render(<SalaryPage />);
    const rows = screen.getAllByRole("row");
    // rows[0] = 表头；工资高的王五排第一
    expect(rows[1]).toHaveTextContent("王五");
    expect(rows[1]).toHaveTextContent("¥90.00");
    expect(rows[2]).toHaveTextContent("李四");
    expect(rows[2]).toHaveTextContent("¥10.00");
  });

  it("8. 添加额外工资成功（填写姓名、金额、备注，保存后显示）", () => {
    render(<SalaryPage />);
    addExtraViaModal("测试员工", "88.5", "全勤奖");
    const text = document.body.textContent || "";
    expect(text).toContain("测试员工");
    expect(text).toContain("全勤奖");
    expect(text).toContain("¥88.50");
  });

  it("9. 删除额外工资成功", () => {
    seedExtras([{ id: "e1", name: "张三", amount: 50, note: "待删补贴", date: "2024-01-01" }]);
    render(<SalaryPage />);
    expect(screen.getByText("待删补贴")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("删除"));
    expect(screen.queryByText("待删补贴")).not.toBeInTheDocument();
  });

  it("10. 额外工资计入员工工资合计", () => {
    seedFanwa([{ id: "f1", name: "张三", spec: "双", quantity: 100, unitPrice: 0.5 }]); // 50
    seedExtras([{ id: "e1", name: "张三", amount: 100, note: "奖金", date: "2024-01-01" }]);
    render(<SalaryPage />);
    // 张三合计 = 翻袜 50 + 额外 100 = 150
    expect(screen.getAllByText("¥150.00").length).toBeGreaterThan(0);
  });

  it("11. 工资总额 = 所有员工工资 + 额外工资", () => {
    seedFanwa([
      { id: "f1", name: "张三", spec: "双", quantity: 100, unitPrice: 0.5 }, // 50
      { id: "f2", name: "李四", spec: "双", quantity: 100, unitPrice: 0.3 }, // 30
    ]);
    seedExtras([{ id: "e1", name: "张三", amount: 100, note: "奖金", date: "2024-01-01" }]);
    render(<SalaryPage />);
    // 工资总额 = 50 + 30 + 100(额外) = 180
    expect(screen.getAllByText("¥180.00").length).toBeGreaterThan(0);
    // 张三 150，李四 30
    expect(screen.getAllByText("¥150.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("¥30.00").length).toBeGreaterThan(0);
  });

  it("12. 额外工资数据持久化到 localStorage (sock-erp-salary)", () => {
    seedExtras([{ id: "e1", name: "张三", amount: 50, note: "原记录", date: "2024-01-01" }]);
    render(<SalaryPage />);
    expect(screen.getByText("原记录")).toBeInTheDocument();
    addExtraViaModal("李四", "20", "新补贴");
    const raw = window.localStorage.getItem("sock-erp-salary");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.length).toBe(2);
    expect(parsed.some((r: ExtraItem) => r.note === "原记录" && r.amount === 50)).toBe(true);
    expect(parsed.some((r: ExtraItem) => r.name === "李四" && r.note === "新补贴" && r.amount === 20)).toBe(true);
  });
});

