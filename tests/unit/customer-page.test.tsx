import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";

// 内存中的 clients 数据，供 api mock 读写；useWorkspace mock 每次渲染读取最新值。
const mockClients: any[] = [];

vi.mock("../../src/api", () => ({
  api: {
    state: vi.fn(async () => ({})),
    create: vi.fn(async (_collection: string, input: Record<string, any>) => {
      const item = { id: `client-${Math.random().toString(36).slice(2, 10)}`, ...input };
      mockClients.push(item);
      return item;
    }),
    update: vi.fn(async (_collection: string, id: string, input: Record<string, any>) => {
      const idx = mockClients.findIndex((c) => c.id === id);
      if (idx >= 0) mockClients[idx] = { ...mockClients[idx], ...input };
      return mockClients[idx];
    }),
    remove: vi.fn(async (_collection: string, id: string) => {
      const idx = mockClients.findIndex((c) => c.id === id);
      if (idx >= 0) mockClients.splice(idx, 1);
    }),
  },
}));

vi.mock("../../src/WorkspaceContext", () => ({
  useWorkspace: () => ({
    get data() {
      return { clients: mockClients.map((c) => ({ ...c })) };
    },
    run: async (op: () => Promise<any>) => {
      await op();
    },
  }),
}));

import { ConsultingPage } from "../../src/pages/ConsultingPage";

function renderPage() {
  return render(<ConsultingPage />);
}

beforeEach(() => {
  window.localStorage.clear();
  mockClients.length = 0;
});

describe("客户中心页面", () => {
  it("渲染页面标题", () => {
    renderPage();
    expect(screen.getByText("客户中心")).toBeInTheDocument();
    expect(screen.getByText("管理客户档案、联系方式和备注信息。")).toBeInTheDocument();
  });

  it("空状态显示添加客户按钮", () => {
    renderPage();
    expect(screen.getByText("还没有客户记录")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /添加客户/ })).toBeInTheDocument();
  });

  it("添加客户成功", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /添加客户/ }));

    const modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText(/客户名称/), { target: { value: "张三" } });
    fireEvent.change(within(modal).getByLabelText(/联系电话/), { target: { value: "13800138000" } });
    fireEvent.click(within(modal).getByRole("button", { name: /添加客户/ }));

    expect(await screen.findByText("张三")).toBeInTheDocument();
    expect(screen.getByText("13800138000")).toBeInTheDocument();
  });

  it("编辑客户成功", async () => {
    renderPage();
    // 先添加
    fireEvent.click(screen.getByRole("button", { name: /添加客户/ }));
    let modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText(/客户名称/), { target: { value: "王五" } });
    fireEvent.click(within(modal).getByRole("button", { name: /添加客户/ }));
    expect(await screen.findByText("王五")).toBeInTheDocument();

    // 编辑
    fireEvent.click(screen.getByLabelText("编辑"));
    modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText(/客户名称/), { target: { value: "王五五" } });
    fireEvent.click(within(modal).getByRole("button", { name: /保存修改/ }));

    expect(await screen.findByText("王五五")).toBeInTheDocument();
    expect(screen.queryByText("王五")).not.toBeInTheDocument();
  });

  it("删除客户成功", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /添加客户/ }));
    const modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText(/客户名称/), { target: { value: "赵六" } });
    fireEvent.click(within(modal).getByRole("button", { name: /添加客户/ }));
    expect(await screen.findByText("赵六")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("删除"));
    const confirmDialog = screen.getByRole("dialog");
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "删除" }));

    await waitFor(() => expect(screen.queryByText("赵六")).not.toBeInTheDocument());
  });

  it("数据持久化显示（seed 客户数据）", () => {
    mockClients.push({
      id: "seed-1",
      name: "持久化客户",
      phone: "13900000000",
      address: "河南郑州",
      notes: "老客户",
    });
    renderPage();

    expect(screen.getByText("持久化客户")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("河南郑州")).toBeInTheDocument();
    expect(within(table).getByText("老客户")).toBeInTheDocument();
  });
});
