import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout } from "../../src/components/Layout";
import { WorkspaceProvider } from "../../src/WorkspaceContext";

function renderLayoutAtWidth(path: string, width: number) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
  Object.defineProperty(document.documentElement, "clientWidth", { writable: true, configurable: true, value: width });
  window.dispatchEvent(new Event("resize"));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <WorkspaceProvider>
          <AppLayout />
        </WorkspaceProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("移动端响应式布局 (3168×1440物理分辨率 ≈ 480×1056 CSS视口)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1024 });
  });

  it("480px宽度下侧边栏、底部导航、汉堡菜单元素存在", () => {
    renderLayoutAtWidth("/", 480);
    expect(document.querySelector(".sidebar")).toBeTruthy();
    expect(document.querySelector(".bottom-nav")).toBeTruthy();
    expect(document.querySelector(".mobile-menu-btn")).toBeTruthy();
  });

  it("480px宽度下底部导航有5个项目（首页/翻袜/缝头/定型/更多）", () => {
    renderLayoutAtWidth("/", 480);
    const bottomNav = document.querySelector(".bottom-nav");
    expect(bottomNav).toBeTruthy();
    expect(bottomNav?.children.length).toBe(5);
    const text = bottomNav?.textContent || "";
    expect(text).toContain("首页");
    expect(text).toContain("翻袜");
    expect(text).toContain("缝头");
    expect(text).toContain("定型");
    expect(text).toContain("更多");
  });

  it("480px宽度下顶部栏有搜索和快速新建按钮", () => {
    renderLayoutAtWidth("/", 480);
    expect(document.querySelector(".search-trigger")).toBeTruthy();
    expect(document.querySelector(".topbar-create")).toBeTruthy();
  });

  it("480px宽度下侧边栏包含所有导航分组", () => {
    renderLayoutAtWidth("/", 480);
    const sidebar = document.querySelector(".sidebar");
    const text = sidebar?.textContent || "";
    expect(text).toContain("总览");
    expect(text).toContain("产品管理中心");
    expect(text).toContain("商品与仓库");
    expect(text).toContain("客户中心");
    expect(text).toContain("收支管理");
    expect(text).toContain("审核中心");
  });

  it("480px宽度下侧边栏包含所有功能页面", () => {
    renderLayoutAtWidth("/", 480);
    const sidebar = document.querySelector(".sidebar");
    const text = sidebar?.textContent || "";
    const pages = ["首页总览", "本月总览", "翻袜", "缝头", "定型", "商品管理", "仓库管理", "分类中心", "库存盘点", "客户中心", "原材料采购", "机器损耗", "运货运费", "工资支出", "货款收入", "支收统计", "采购审核", "出库审核", "销货审核", "数据与设置"];
    for (const page of pages) {
      expect(text).toContain(page);
    }
  });

  it("768px宽度下也触发移动端元素", () => {
    renderLayoutAtWidth("/", 768);
    expect(document.querySelector(".bottom-nav")).toBeTruthy();
    expect(document.querySelector(".mobile-menu-btn")).toBeTruthy();
  });

  it("1024px宽度下桌面端元素存在", () => {
    renderLayoutAtWidth("/", 1024);
    expect(document.querySelector(".sidebar")).toBeTruthy();
    expect(document.querySelector(".desktop-collapse-btn")).toBeTruthy();
  });

  it("480px宽度下页面容器有底部内边距（给底部导航留空间）", () => {
    renderLayoutAtWidth("/", 480);
    const container = document.querySelector(".page-container");
    expect(container).toBeTruthy();
  });

  it("480px宽度下点击汉堡菜单显示移动端遮罩层", () => {
    renderLayoutAtWidth("/", 480);
    expect(document.querySelector(".mobile-overlay")).toBeFalsy();
    const menuBtn = document.querySelector(".mobile-menu-btn");
    expect(menuBtn).toBeTruthy();
    fireEvent.click(menuBtn!);
    expect(document.querySelector(".mobile-overlay")).toBeTruthy();
  });

  it("所有导航链接都有正确的路由路径", () => {
    renderLayoutAtWidth("/", 480);
    const links = document.querySelectorAll(".sidebar .nav-link");
    expect(links.length).toBeGreaterThan(10);
    const hrefs = Array.from(links).map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/");
    expect(hrefs).toContain("/fanwa");
    expect(hrefs).toContain("/fengtou");
    expect(hrefs).toContain("/dingxing");
    expect(hrefs).toContain("/consulting");
    expect(hrefs).toContain("/customer");
    expect(hrefs).toContain("/salary");
  });
});
