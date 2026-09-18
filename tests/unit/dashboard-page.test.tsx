import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// 可变的 mock 状态，便于在用例中切换 settings
const h = vi.hoisted(() => ({
  settings: {} as Record<string, any>,
  saveSettings: vi.fn(() => Promise.resolve({})),
}));

// Mock dependencies - paths relative to this test file (tests/unit/)
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    isLoading: false,
    error: null,
    data: {
      overview: { progress: 50, completed: 3, total: 6, scheduledMinutes: 120 },
      timeline: [],
      unscheduled: [],
      attention: [],
      summaries: {},
    },
    refetch: vi.fn(),
  }),
}));

vi.mock("../../src/api", () => ({
  api: {
    dashboard: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    completePlan: vi.fn(),
    convertMemo: vi.fn(),
    saveSettings: h.saveSettings,
  },
}));

vi.mock("../../src/WorkspaceContext", () => ({
  useWorkspace: () => ({
    data: {
      quickMemos: [],
      consultingProjects: [],
      consultingInteractions: [],
      settings: h.settings,
    },
    registerSaveHandler: vi.fn(),
    run: (operation: () => Promise<unknown>) => operation(),
  }),
}));

import { DashboardPage } from "../../src/pages/DashboardPage";

beforeEach(() => {
  window.localStorage.clear();
  h.settings = {};
  h.saveSettings.mockClear();
});

function renderDashboard() {
  return render(<MemoryRouter><DashboardPage /></MemoryRouter>);
}

describe("首页总览", () => {
  it("不显示本月进度条", () => {
    renderDashboard();
    expect(screen.queryByText("本月进度")).not.toBeInTheDocument();
    expect(screen.queryByText("已完成")).not.toBeInTheDocument();
    expect(screen.queryByText("已安排")).not.toBeInTheDocument();
  });

  it("生产卡片显示包数为主，金额为辅并按姓名/颜色分组", () => {
    window.localStorage.setItem("sock-erp-fanwa", JSON.stringify([
      { id: "1", name: "甲", spec: "包", quantity: 10, unitPrice: 5 },
      { id: "2", name: "乙", spec: "包", quantity: 5, unitPrice: 5 },
    ]));
    window.localStorage.setItem("sock-erp-fengtou", JSON.stringify([
      { id: "1", name: "丙", spec: "包", quantity: 20, unitPrice: 3 },
    ]));
    window.localStorage.setItem("sock-erp-dingxing", JSON.stringify([
      { id: "1", name: "丁", color: "白色", spec: "包", quantity: 15, unitPrice: 4 },
    ]));

    renderDashboard();
    const text = document.body.textContent || "";
    expect(text).toContain("¥75");
    expect(text).toContain("¥60");
    expect(text).toContain("15包");
    expect(text).toContain("20包");
    expect(text).toContain("甲:10包");
    expect(text).toContain("乙:5包");
    expect(text).toContain("白色:15包");
  });

  it("无数据时生产卡片显示0元0包", () => {
    renderDashboard();
    const text = document.body.textContent || "";
    expect(text).toContain("¥0");
    expect(text).toContain("0包");
  });

  it("显示生产数据总览标题", () => {
    renderDashboard();
    expect(screen.getByText("生产数据总览")).toBeInTheDocument();
  });

  it("不显示本月时间线", () => {
    renderDashboard();
    expect(screen.queryByText("本月时间线")).not.toBeInTheDocument();
  });

  it("显示当日产量而不是事项", () => {
    renderDashboard();
    const text = document.body.textContent || "";
    expect(text).toContain("当日产量");
    expect(text).not.toContain("本月时间线");
  });

  it("不显示产品中心卡片", () => {
    renderDashboard();
    expect(screen.queryByText("产品中心")).not.toBeInTheDocument();
  });

  it("仓库余量按颜色和规格显示包数和公斤数", () => {
    window.localStorage.setItem("sock-erp-dingxing", JSON.stringify([
      { id: "dx1", name: "张三", color: "白色", spec: "包", quantity: 100, unitPrice: 5 },
      { id: "dx2", name: "李四", color: "黑色", spec: "双", quantity: 50, unitPrice: 3 },
    ]));
    window.localStorage.setItem("sock-erp-finished-inventory", JSON.stringify([
      { id: "fi1", linkedId: "dx1", quantity: 50, weightKg: 100, note: "", type: "in", date: "2024-01-01" },
      { id: "fi2", linkedId: "dx2", quantity: 20, weightKg: 40, note: "", type: "in", date: "2024-01-02" },
    ]));
    renderDashboard();
    const text = document.body.textContent || "";
    expect(text).toContain("白色");
    expect(text).toContain("50包");
    expect(text).toContain("100公斤");
    expect(text).toContain("黑色");
    expect(text).toContain("20包");
    expect(text).toContain("40公斤");
  });
});

describe("各模块摘要自定义", () => {
  const moduleLabels = ["商品管理", "仓库管理", "客户中心", "原材料采购", "库存盘点", "机器损耗"];

  it("各模块摘要区域提供自定义入口", () => {
    renderDashboard();
    expect(screen.getByText("各模块摘要")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /自定义/ })).toBeInTheDocument();
  });

  it("未配置时默认显示全部6个模块", () => {
    renderDashboard();
    const text = document.body.textContent || "";
    moduleLabels.forEach((label) => expect(text).toContain(label));
  });

  it("点击自定义弹出包含全部模块且默认勾选的弹窗", () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: /自定义/ }));
    expect(screen.getByText("自定义模块摘要")).toBeInTheDocument();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(6);
    expect(boxes.every((box) => (box as HTMLInputElement).checked)).toBe(true);
    // 弹窗打开后，每个模块标题同时出现在摘要卡片和弹窗勾选项中（各一次）
    moduleLabels.forEach((label) => expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(2));
  });

  it("取消勾选某模块并完成后，保存不含该模块的 dashboardModules", () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: /自定义/ }));
    const boxes = screen.getAllByRole("checkbox");
    // 顺序：商品管理 / 仓库管理 / 客户中心 / 原材料采购 / 库存盘点 / 机器损耗
    fireEvent.click(boxes[2]); // 取消勾选“客户中心”
    fireEvent.click(screen.getByRole("button", { name: "完成" }));
    expect(h.saveSettings).toHaveBeenCalledTimes(1);
    const payload = h.saveSettings.mock.calls[0][0] as { dashboardModules: string[] };
    expect(Array.isArray(payload.dashboardModules)).toBe(true);
    expect(payload.dashboardModules).not.toContain("customer");
    expect(payload.dashboardModules).toContain("development");
    expect(payload.dashboardModules).toHaveLength(5);
  });

  it("全选按钮恢复全部模块并保存", () => {
    h.settings = { dashboardModules: ["development"] };
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: /自定义/ }));
    fireEvent.click(screen.getByRole("button", { name: "全选" }));
    fireEvent.click(screen.getByRole("button", { name: "完成" }));
    const payload = h.saveSettings.mock.calls[0][0] as { dashboardModules: string[] };
    expect(payload.dashboardModules).toHaveLength(6);
  });

  it("按 settings.dashboardModules 只显示被选中的模块", () => {
    h.settings = { dashboardModules: ["development", "fitness"] };
    renderDashboard();
    const text = document.body.textContent || "";
    expect(text).toContain("商品管理");
    expect(text).toContain("原材料采购");
    expect(text).not.toContain("客户中心");
    expect(text).not.toContain("机器损耗");
  });

  it("dashboardModules 为空数组时显示全部隐藏提示", () => {
    h.settings = { dashboardModules: [] };
    renderDashboard();
    expect(screen.getByText(/已隐藏全部模块/)).toBeInTheDocument();
  });
});
