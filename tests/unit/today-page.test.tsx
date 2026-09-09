import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ isLoading: false, error: null, data: null, refetch: vi.fn() }),
}));

vi.mock("../../src/api", () => ({
  api: {
    getReview: vi.fn().mockResolvedValue({ content: "" }),
    setReview: vi.fn(),
    completePlan: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    postponePlan: vi.fn(),
  },
}));

vi.mock("../../src/WorkspaceContext", () => ({
  useWorkspace: () => ({
    data: {
      planItems: [],
      consultingProjects: [],
      consultingInteractions: [],
      settings: {},
    },
    registerSaveHandler: vi.fn(),
    run: vi.fn(),
  }),
}));

import { TodayPage } from "../../src/pages/TodayPage";

beforeEach(() => {
  window.localStorage.clear();
});

function renderToday() {
  return render(<MemoryRouter><TodayPage /></MemoryRouter>);
}

describe("本月总览数据卡片", () => {
  it("显示5个数据卡片标题", () => {
    renderToday();
    expect(screen.getByText("成品数量")).toBeInTheDocument();
    expect(screen.getByText("仓库总量")).toBeInTheDocument();
    expect(screen.getByText("库存余量")).toBeInTheDocument();
    expect(screen.getByText("本月支出")).toBeInTheDocument();
    expect(screen.getByText("本月收入")).toBeInTheDocument();
  });

  it("成品数量从定型数据读取", () => {
    window.localStorage.setItem("sock-erp-dingxing", JSON.stringify([
      { id: "1", name: "A", color: "白色", spec: "双", quantity: 100, unitPrice: 5 },
      { id: "2", name: "B", color: "黑色", spec: "双", quantity: 50, unitPrice: 4 },
    ]));
    renderToday();
    const text = document.body.textContent || "";
    expect(text).toContain("150双");
  });

  it("本月支出包含四类费用", () => {
    window.localStorage.setItem("sock-erp-machine-loss", JSON.stringify([
      { id: "1", date: "2024-01-01", amount: 100, note: "" },
    ]));
    window.localStorage.setItem("sock-erp-freight", JSON.stringify([
      { id: "1", date: "2024-01-01", amount: 200, note: "" },
    ]));
    window.localStorage.setItem("sock-erp-salary", JSON.stringify([
      { id: "1", date: "2024-01-01", amount: 300, note: "" },
    ]));
    window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
      { id: "1", name: "棉纱", spec: "", weight: 10, unitPrice: 40, amount: 400 },
    ]));
    renderToday();
    const text = document.body.textContent || "";
    // 总支出 = 100 + 200 + 300 + 400 = 1000
    expect(text).toContain("¥1000");
  });

  it("无数据时显示0", () => {
    renderToday();
    const text = document.body.textContent || "";
    expect(text).toContain("¥0");
  });

  it("显示本月总览标题", () => {
    renderToday();
    expect(screen.getByText("本月总览")).toBeInTheDocument();
  });
});
