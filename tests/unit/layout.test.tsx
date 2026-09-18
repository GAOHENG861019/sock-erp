import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout } from "../../src/components/Layout";
import { WorkspaceProvider } from "../../src/WorkspaceContext";

function renderLayout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <WorkspaceProvider>
          <AppLayout />
        </WorkspaceProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("布局导航", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("库存盘点在商品与仓库分组下", () => {
    renderLayout();
    const navs = screen.getAllByRole("navigation");
    const nav = navs.find((n) => (n.textContent || "").includes("商品与仓库")) || navs[0];
    const text = nav.textContent || "";
    // 商品与仓库分组包含库存盘点
    const warehouseIdx = text.indexOf("商品与仓库");
    const customerIdx = text.indexOf("客户中心");
    const inventoryIdx = text.indexOf("库存盘点");
    expect(inventoryIdx).toBeGreaterThan(warehouseIdx);
    expect(inventoryIdx).toBeLessThan(customerIdx);
  });

  it("快速新建弹窗显示自定义按钮", () => {
    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: /快速新建/ }));
    const modal = screen.getByRole("dialog");
    expect(within(modal).getByRole("button", { name: /自定义/ })).toBeInTheDocument();
  });

  it("快速新建自定义模式可以勾选选项", () => {
    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: /快速新建/ }));
    const modal = screen.getByRole("dialog");
    fireEvent.click(within(modal).getByRole("button", { name: /自定义/ }));
    const checkboxes = within(modal).getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThan(5);
    // 取消勾选第一个
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0]).not.toBeChecked();
  });

  it("快速新建自定义设置保存到localStorage", () => {
    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: /快速新建/ }));
    const modal = screen.getByRole("dialog");
    fireEvent.click(within(modal).getByRole("button", { name: /自定义/ }));
    const checkboxes = within(modal).getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    const saved = JSON.parse(window.localStorage.getItem("sock-erp-quick-create") || "[]");
    expect(Array.isArray(saved)).toBe(true);
    expect(saved.length).toBeGreaterThan(0);
  });
});
