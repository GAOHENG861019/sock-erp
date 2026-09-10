import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../src/api", () => ({
  api: {
    state: vi.fn(),
    saveNow: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock("../../src/WorkspaceContext", () => ({
  useWorkspace: () => ({
    data: {
      foods: [],
      clients: [],
      consultingProjects: [],
      consultingInteractions: [],
    },
    run: vi.fn(),
    saveNow: vi.fn(),
  }),
}));

import { DietPage } from "../../src/pages/DietPage";

beforeEach(() => {
  window.localStorage.clear();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <DietPage />
    </MemoryRouter>
  );
}

describe("库存盘点页面", () => {
  it("渲染页面标题", () => {
    renderPage();
    expect(screen.getByText("库存盘点")).toBeInTheDocument();
  });

  it("显示成品库存和原材料库存两个区域", () => {
    renderPage();
    expect(screen.getByText("成品库存（关联定型）")).toBeInTheDocument();
    expect(screen.getByText("原材料库存（关联原材料采购）")).toBeInTheDocument();
  });

  it("保留保存和撤销按钮", () => {
    renderPage();
    expect(screen.getByRole("button", { name: /保存/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /撤销/ })).toBeInTheDocument();
  });

  it("没有数据时显示成品空状态", () => {
    renderPage();
    expect(screen.getByText("暂无成品库存数据")).toBeInTheDocument();
  });

  it("没有数据时显示原材料空状态", () => {
    renderPage();
    expect(screen.getByText("暂无原材料库存数据")).toBeInTheDocument();
  });

  it("成品区按颜色分组显示，显示颜色名称和规格数量", () => {
    window.localStorage.setItem("sock-erp-dingxing", JSON.stringify([
      { id: "1", name: "张三", color: "白色", spec: "双", quantity: 100, unitPrice: 5 },
      { id: "2", name: "李四", color: "白色", spec: "包", quantity: 50, unitPrice: 20 },
      { id: "3", name: "王五", color: "黑色", spec: "双", quantity: 30, unitPrice: 4 },
    ]));
    renderPage();

    expect(screen.getByText("白色")).toBeInTheDocument();
    expect(screen.getByText("黑色")).toBeInTheDocument();
    // 白色组汇总：100双 + 50包
    const text = document.body.textContent || "";
    expect(text).toContain("100双");
    expect(text).toContain("50包");
  });

  it("成品表格显示姓名、规格、数量、单价、合计", () => {
    window.localStorage.setItem("sock-erp-dingxing", JSON.stringify([
      { id: "1", name: "张三", color: "白色", spec: "双", quantity: 100, unitPrice: 5 },
    ]));
    renderPage();

    expect(screen.getByText("张三")).toBeInTheDocument();
    expect(screen.getByText("双")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("¥5.00")).toBeInTheDocument();
    // 合计 = 100 * 5 = 500
    expect(screen.getByText("¥500.00")).toBeInTheDocument();
  });

  it("原材料区显示名称、规格、重量、金额", () => {
    window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
      { id: "1", name: "棉纱", spec: "20支", weight: 10, unitPrice: 40, amount: 400 },
    ]));
    renderPage();

    expect(screen.getByText("棉纱")).toBeInTheDocument();
    expect(screen.getByText("20支")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("¥40.00")).toBeInTheDocument();
    expect(screen.getByText("¥400.00")).toBeInTheDocument();
  });

  it("成品总数量和总金额计算正确", () => {
    window.localStorage.setItem("sock-erp-dingxing", JSON.stringify([
      { id: "1", name: "张三", color: "白色", spec: "双", quantity: 100, unitPrice: 5 },
      { id: "2", name: "李四", color: "白色", spec: "包", quantity: 50, unitPrice: 20 },
      { id: "3", name: "王五", color: "黑色", spec: "双", quantity: 30, unitPrice: 4 },
    ]));
    renderPage();

    // 总数量 = 100 + 50 + 30 = 180
    // 总金额 = 100*5 + 50*20 + 30*4 = 500 + 1000 + 120 = 1620
    const text = document.body.textContent || "";
    expect(text).toContain("总数量 180");
    expect(text).toContain("¥1620.00");
  });

  it("原材料总重量和总金额计算正确", () => {
    window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
      { id: "1", name: "棉纱", spec: "20支", weight: 10, unitPrice: 40, amount: 400 },
      { id: "2", name: "涤纶", spec: "40支", weight: 5, unitPrice: 30, amount: 150 },
    ]));
    renderPage();

    const text = document.body.textContent || "";
    expect(text).toContain("总重量 15");
    expect(text).toContain("¥550.00");
  });

  it("翻袜库存关联翻袜数据按姓名显示", () => {
    window.localStorage.setItem("sock-erp-fanwa", JSON.stringify([
      { id: "1", name: "张三", spec: "包", quantity: 50, unitPrice: 3 },
      { id: "2", name: "李四", spec: "双", quantity: 100, unitPrice: 1 },
    ]));
    renderPage();
    const text = document.body.textContent || "";
    expect(text).toContain("翻袜库存");
    expect(text).toContain("张三");
    expect(text).toContain("李四");
    expect(text).toContain("翻袜总计");
    // 总数量 = 50 + 100 = 150, 总金额 = 50*3 + 100*1 = 250
    expect(text).toContain("总数量 150");
    expect(text).toContain("¥250.00");
  });

  it("缝头库存关联缝头数据按姓名显示", () => {
    window.localStorage.setItem("sock-erp-fengtou", JSON.stringify([
      { id: "1", name: "王五", spec: "包", quantity: 30, unitPrice: 4 },
    ]));
    renderPage();
    const text = document.body.textContent || "";
    expect(text).toContain("缝头库存");
    expect(text).toContain("王五");
    expect(text).toContain("缝头总计");
    expect(text).toContain("总数量 30");
    expect(text).toContain("¥120.00");
  });
});
