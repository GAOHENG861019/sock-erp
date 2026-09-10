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
    expect(screen.getByText("仓库余量")).toBeInTheDocument();
    expect(screen.getByText("仓库重量")).toBeInTheDocument();
    expect(screen.getByText("本月支出")).toBeInTheDocument();
    expect(screen.getByText("本月收入")).toBeInTheDocument();
  });

  it("成品数量从定型数据读取按包统计", () => {
    window.localStorage.setItem("sock-erp-dingxing", JSON.stringify([
      { id: "1", name: "A", color: "白色", spec: "包", quantity: 100, unitPrice: 5 },
      { id: "2", name: "B", color: "黑色", spec: "包", quantity: 50, unitPrice: 4 },
    ]));
    renderToday();
    const text = document.body.textContent || "";
    expect(text).toContain("150包");
  });

  it("定型按颜色分别显示", () => {
    window.localStorage.setItem("sock-erp-dingxing", JSON.stringify([
      { id: "1", name: "A", color: "白色", spec: "包", quantity: 100, unitPrice: 5 },
      { id: "2", name: "B", color: "黑色", spec: "包", quantity: 50, unitPrice: 4 },
    ]));
    renderToday();
    const text = document.body.textContent || "";
    expect(text).toContain("定型按颜色统计");
    expect(text).toContain("白色");
    expect(text).toContain("黑色");
    expect(text).toContain("100包");
    expect(text).toContain("50包");
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

  it("仓库余量按颜色显示", () => {
    window.localStorage.setItem("sock-erp-dingxing", JSON.stringify([
      { id: "dx1", name: "A", color: "白色", spec: "包", quantity: 100, unitPrice: 5 },
      { id: "dx2", name: "B", color: "黑色", spec: "包", quantity: 50, unitPrice: 4 },
    ]));
    window.localStorage.setItem("sock-erp-finished-inventory", JSON.stringify([
      { id: "fi1", linkedId: "dx1", quantity: 30, note: "" },
      { id: "fi2", linkedId: "dx2", quantity: 20, note: "" },
    ]));
    renderToday();
    const text = document.body.textContent || "";
    expect(text).toContain("白色");
    expect(text).toContain("30公斤");
    expect(text).toContain("黑色");
    expect(text).toContain("20公斤");
    expect(text).toContain("50公斤");
  });

  it("仓库重量关联原材料按名称显示", () => {
    window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
      { id: "1", name: "棉纱", spec: "", weight: 50, unitPrice: 40, amount: 2000 },
      { id: "2", name: "涤纶", spec: "", weight: 30, unitPrice: 30, amount: 900 },
    ]));
    renderToday();
    const text = document.body.textContent || "";
    expect(text).toContain("仓库重量");
    expect(text).toContain("80公斤");
    expect(text).toContain("棉纱");
    expect(text).toContain("涤纶");
  });
});
