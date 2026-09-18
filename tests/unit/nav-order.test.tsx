import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
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

function getNavGroups() {
  const sidebar = document.querySelector(".sidebar");
  const groups = sidebar?.querySelectorAll(".nav-group") || [];
  const result: Array<{ label: string; links: string[] }> = [];
  for (const group of groups) {
    const label = group.querySelector(".nav-label")?.textContent || "";
    const links = Array.from(group.querySelectorAll(".nav-link")).map((l) => l.textContent?.trim() || "");
    result.push({ label, links });
  }
  return result;
}

describe("导航功能键排序", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("导航分组顺序正确", () => {
    renderLayout();
    const groups = getNavGroups();
    const groupLabels = groups.map((g) => g.label);
    expect(groupLabels).toEqual(["总览", "产品管理中心", "商品与仓库", "客户中心", "收支管理", "审核中心", "系统"]);
  });

  it("总览分组包含首页总览和本月总览", () => {
    renderLayout();
    const groups = getNavGroups();
    const overview = groups.find((g) => g.label === "总览");
    expect(overview?.links).toEqual(["首页总览", "本月总览"]);
  });

  it("产品管理中心分组按翻袜、缝头、定型排序", () => {
    renderLayout();
    const groups = getNavGroups();
    const product = groups.find((g) => g.label === "产品管理中心");
    expect(product?.links).toEqual(["翻袜", "缝头", "定型"]);
  });

  it("商品与仓库分组按商品管理、仓库管理、分类中心、库存盘点排序", () => {
    renderLayout();
    const groups = getNavGroups();
    const warehouse = groups.find((g) => g.label === "商品与仓库");
    expect(warehouse?.links).toEqual(["商品管理", "仓库管理", "分类中心", "库存盘点"]);
  });

  it("客户中心分组只包含客户中心", () => {
    renderLayout();
    const groups = getNavGroups();
    const customer = groups.find((g) => g.label === "客户中心");
    expect(customer?.links).toEqual(["客户中心"]);
  });

  it("收支管理分组按原材料采购、机器损耗、运货运费、工资支出、货款收入、支收统计排序", () => {
    renderLayout();
    const groups = getNavGroups();
    const expense = groups.find((g) => g.label === "收支管理");
    expect(expense?.links).toEqual(["原材料采购", "机器损耗", "运货运费", "工资支出", "货款收入", "支收统计"]);
  });

  it("审核中心分组按采购审核、出库审核、销货审核排序", () => {
    renderLayout();
    const groups = getNavGroups();
    const audit = groups.find((g) => g.label === "审核中心");
    expect(audit?.links).toEqual(["采购审核", "出库审核", "销货审核"]);
  });

  it("系统分组包含数据与设置", () => {
    renderLayout();
    const groups = getNavGroups();
    const system = groups.find((g) => g.label === "系统");
    expect(system?.links).toEqual(["数据与设置"]);
  });

  it("底部导航按首页、翻袜、缝头、定型、更多排序", () => {
    renderLayout();
    const bottomNav = document.querySelector(".bottom-nav");
    const items = Array.from(bottomNav?.children || []).map((c) => c.textContent?.trim() || "");
    expect(items).toEqual(["首页", "翻袜", "缝头", "定型", "更多"]);
  });

  it("所有页面都在导航中且无重复", () => {
    renderLayout();
    const groups = getNavGroups();
    const allLinks = groups.flatMap((g) => g.links);
    const expected = ["首页总览", "本月总览", "翻袜", "缝头", "定型", "商品管理", "仓库管理", "分类中心", "库存盘点", "客户中心", "原材料采购", "机器损耗", "运货运费", "工资支出", "货款收入", "支收统计", "采购审核", "出库审核", "销货审核", "数据与设置"];
    expect(allLinks).toEqual(expected);
    // 无重复
    expect(new Set(allLinks).size).toBe(allLinks.length);
  });
});
