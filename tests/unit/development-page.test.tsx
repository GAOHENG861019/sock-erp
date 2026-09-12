import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../src/api", () => ({
  api: {
    update: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("../../src/WorkspaceContext", () => ({
  useWorkspace: () => ({
    data: {
      devProjects: [
        { id: "1", name: "棉袜", description: "纯棉袜子", status: "active", local_path: "200针", repository_url: "XX纺织" },
        { id: "2", name: "运动袜", description: "", status: "paused", local_path: "168针", repository_url: "" },
      ],
      devMilestones: [],
    },
    run: vi.fn(),
  }),
}));

import { DevelopmentPage } from "../../src/pages/DevelopmentPage";

beforeEach(() => {
  window.localStorage.clear();
});

describe("商品管理-去掉在售", () => {
  it("不显示在售文字", () => {
    render(<MemoryRouter><DevelopmentPage /></MemoryRouter>);
    expect(screen.queryByText("在售")).not.toBeInTheDocument();
  });

  it("不显示状态下拉选项", () => {
    render(<MemoryRouter><DevelopmentPage /></MemoryRouter>);
    // 点击新建商品
    fireEvent.click(screen.getByText("新建商品"));
    // 弹窗中不应有状态字段
    expect(screen.queryByText("状态")).not.toBeInTheDocument();
    expect(screen.queryByText("在售")).not.toBeInTheDocument();
  });

  it("商品列表不显示在售徽章", () => {
    render(<MemoryRouter><DevelopmentPage /></MemoryRouter>);
    const text = document.body.textContent || "";
    expect(text).toContain("棉袜");
    expect(text).toContain("运动袜");
    expect(text).not.toContain("在售");
  });

  it("显示商品管理标题", () => {
    render(<MemoryRouter><DevelopmentPage /></MemoryRouter>);
    expect(screen.getByText("商品管理")).toBeInTheDocument();
  });

  it("商品以卡片形式展示", () => {
    render(<MemoryRouter><DevelopmentPage /></MemoryRouter>);
    expect(screen.getByText("商品列表")).toBeInTheDocument();
    expect(screen.getByText("棉袜")).toBeInTheDocument();
    expect(screen.getByText("运动袜")).toBeInTheDocument();
    // 卡片显示规格和供应商
    expect(screen.getByText("规格：200针")).toBeInTheDocument();
    expect(screen.getByText("供应商：XX纺织")).toBeInTheDocument();
  });
});
