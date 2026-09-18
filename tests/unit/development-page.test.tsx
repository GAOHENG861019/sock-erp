import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { DevelopmentPage } from "../../src/pages/DevelopmentPage";

beforeEach(() => {
  window.localStorage.clear();
  // 预置商品数据
  window.localStorage.setItem("sock-erp-products", JSON.stringify([
    { id: "1", name: "棉袜", description: "纯棉袜子", local_path: "200针", repository_url: "XX纺织" },
    { id: "2", name: "运动袜", description: "", local_path: "168针", repository_url: "" },
  ]));
  window.localStorage.setItem("sock-erp-milestones", JSON.stringify([]));
});

describe("商品管理-去掉在售", () => {
  it("不显示在售文字", () => {
    render(<MemoryRouter><DevelopmentPage /></MemoryRouter>);
    expect(screen.queryByText("在售")).not.toBeInTheDocument();
  });

  it("不显示状态下拉选项", () => {
    render(<MemoryRouter><DevelopmentPage /></MemoryRouter>);
    fireEvent.click(screen.getByText("新建商品"));
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
    expect(screen.getByText("规格：200针")).toBeInTheDocument();
    expect(screen.getByText("供应商：XX纺织")).toBeInTheDocument();
  });

  it("支持添加新商品", () => {
    render(<MemoryRouter><DevelopmentPage /></MemoryRouter>);
    fireEvent.click(screen.getByText("新建商品"));
    expect(screen.getByText("商品名称")).toBeInTheDocument();
  });
});
