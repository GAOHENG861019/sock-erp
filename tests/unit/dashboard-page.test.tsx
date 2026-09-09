import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

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
  },
}));

vi.mock("../../src/WorkspaceContext", () => ({
  useWorkspace: () => ({
    data: {
      quickMemos: [],
      consultingProjects: [],
      consultingInteractions: [],
      settings: { dashboardModules: [] },
    },
    registerSaveHandler: vi.fn(),
    run: vi.fn(),
  }),
}));

import { DashboardPage } from "../../src/pages/DashboardPage";

beforeEach(() => {
  window.localStorage.clear();
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

  it("生产卡片显示金额为主，数量为辅", () => {
    window.localStorage.setItem("sock-erp-fanwa", JSON.stringify([
      { id: "1", name: "甲", spec: "双", quantity: 10, unitPrice: 5 },
    ]));
    window.localStorage.setItem("sock-erp-fengtou", JSON.stringify([
      { id: "1", name: "乙", spec: "双", quantity: 20, unitPrice: 3 },
    ]));
    window.localStorage.setItem("sock-erp-dingxing", JSON.stringify([
      { id: "1", name: "丙", color: "白色", spec: "双", quantity: 15, unitPrice: 4 },
    ]));

    renderDashboard();
    const text = document.body.textContent || "";
    expect(text).toContain("¥50");
    expect(text).toContain("¥60");
    expect(text).toContain("数量 10双");
    expect(text).toContain("数量 20双");
    expect(text).toContain("数量 15双");
  });

  it("无数据时生产卡片显示0元", () => {
    renderDashboard();
    const text = document.body.textContent || "";
    expect(text).toContain("¥0");
    expect(text).toContain("数量 0");
  });

  it("显示生产数据总览标题", () => {
    renderDashboard();
    expect(screen.getByText("生产数据总览")).toBeInTheDocument();
  });
});
