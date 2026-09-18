import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/App";
import { WorkspaceProvider } from "../../src/WorkspaceContext";
import type { WorkspaceState } from "../../src/types";

const emptyState: WorkspaceState = {
  planItems: [], quickMemos: [], mediaContents: [], devProjects: [], devMilestones: [], devWorkItems: [], devLogs: [],
  clients: [], consultingProjects: [], consultingInteractions: [], consultingDeliverables: [], consultingFollowups: [], consultingTimeEntries: [],
  workoutTemplates: [], workoutTemplateExercises: [], workouts: [], workoutExercises: [], workoutSets: [], bodyMetrics: [], nutritionTargets: [],
  foods: [], meals: [], mealItems: [], entertainmentItems: [], playSessions: [], settings: {}, trash: [],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function mockApi(theme = "light", appearance = "liquid") {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/state" && method === "GET") {
      return jsonResponse({ data: { ...emptyState, settings: { theme, appearance } } });
    }
    if (url === "/api/dashboard" && method === "GET") {
      return jsonResponse({ data: { today: {}, week: {}, month: {} } });
    }
    if (url === "/api/system/status" && method === "GET") {
      return jsonResponse({ data: { state: "idle", lastSavedAt: null, lastError: null, database: "local", dataFile: "workspace.json" } });
    }
    if (url === "/api/system/save" && method === "POST") {
      return jsonResponse({ data: { savedAt: new Date().toISOString(), database: "local", dataFile: "workspace.json" } });
    }
    return jsonResponse({ error: "Not found" }, 404);
  }));
}

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><WorkspaceProvider><App /></WorkspaceProvider></QueryClientProvider>);
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-appearance");
  window.history.pushState({}, "", "/");
  window.localStorage.clear();
});

describe("application shell", () => {
  it("renders all navigation destinations", async () => {
    mockApi();
    renderApp();
    const sidebar = await screen.findByLabelText("主导航");
    expect(sidebar).toBeInTheDocument();
    for (const label of ["首页总览", "本月总览", "翻袜", "缝头", "定型", "商品管理", "仓库管理", "客户中心", "分类中心", "库存盘点", "原材料采购", "机器损耗", "运货运费", "工资支出", "支收统计", "货款收入", "采购审核", "出库审核", "销货审核", "数据与设置"]) {
      expect(sidebar.textContent).toContain(label);
    }
    expect(screen.getByRole("button", { name: /搜索所有内容/ })).toBeInTheDocument();
    expect(screen.getByText("仅保存在这台电脑")).toBeInTheDocument();
  });

  it("applies the persisted theme to the document", async () => {
    mockApi("dark");
    renderApp();
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
  });

  it("uses liquid as the safe default appearance", async () => {
    mockApi();
    renderApp();
    await waitFor(() => expect(document.documentElement.dataset.appearance).toBe("liquid"));
    expect(document.querySelector(".ambient-environment")).toBeInTheDocument();
  });

  it("applies a persisted notebook appearance", async () => {
    mockApi("light", "notebook");
    const { container } = renderApp();
    await waitFor(() => expect(document.documentElement.dataset.appearance).toBe("notebook"));
    expect(container.querySelector(".notebook-environment")).toBeInTheDocument();
    expect(document.querySelector(".ambient-environment")).not.toBeInTheDocument();
  });

  it("applies a persisted neo appearance", async () => {
    mockApi("light", "neo");
    const { container } = renderApp();
    await waitFor(() => expect(document.documentElement.dataset.appearance).toBe("neo"));
    expect(container.querySelector(".app-shell")).toHaveClass("neo-shell");
    expect(document.querySelector(".ambient-environment")).not.toBeInTheDocument();
  });

  it("offers a manual save button", async () => {
    mockApi();
    renderApp();
    expect(await screen.findByRole("button", { name: "手动保存" })).toBeInTheDocument();
  });

  it("shows bottom navigation with 5 items", async () => {
    mockApi();
    renderApp();
    const bottomNav = await screen.findByLabelText("底部导航");
    expect(bottomNav).toBeInTheDocument();
    expect(bottomNav.children.length).toBe(5);
    expect(bottomNav.textContent).toContain("首页");
    expect(bottomNav.textContent).toContain("翻袜");
    expect(bottomNav.textContent).toContain("缝头");
    expect(bottomNav.textContent).toContain("定型");
    expect(bottomNav.textContent).toContain("更多");
  });

  it("mobile menu button opens sidebar", async () => {
    mockApi();
    renderApp();
    const menuBtn = await screen.findByRole("button", { name: "菜单" });
    expect(menuBtn).toBeInTheDocument();
    await userEvent.click(menuBtn);
    expect(document.querySelector(".mobile-overlay")).toBeInTheDocument();
  });
});
