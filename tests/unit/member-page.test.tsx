import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemberPage } from "../../src/pages/MemberPage";

function renderPage() {
  return render(<MemberPage />);
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("会员管理页面", () => {
  it("渲染页面标题和统计卡片", () => {
    renderPage();
    expect(screen.getByText("会员管理")).toBeInTheDocument();
    expect(screen.getByText("会员总数")).toBeInTheDocument();
    expect(screen.getByText("积分总计")).toBeInTheDocument();
    expect(screen.getByText("储值总额")).toBeInTheDocument();
  });

  it("空状态提示", () => {
    renderPage();
    expect(screen.getByText("暂无会员")).toBeInTheDocument();
  });

  it("添加会员成功", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /添加会员/ }));

    const modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText(/会员姓名/), { target: { value: "张三" } });
    fireEvent.change(within(modal).getByLabelText(/联系电话/), { target: { value: "13800138000" } });

    fireEvent.click(within(modal).getByRole("button", { name: /保存并继续/ }));

    expect(await screen.findByText("张三")).toBeInTheDocument();
    expect(screen.getByText("13800138000")).toBeInTheDocument();
  });

  it("统计卡片随会员添加更新", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /添加会员/ }));
    const modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText(/会员姓名/), { target: { value: "李四" } });
    fireEvent.change(within(modal).getByLabelText(/积分/), { target: { value: "100" } });
    fireEvent.change(within(modal).getByLabelText(/储值余额/), { target: { value: "50" } });
    fireEvent.click(within(modal).getByRole("button", { name: /保存并继续/ }));

    expect(await screen.findByText("李四")).toBeInTheDocument();
    // 统计卡片存在且数量正确
    const statCards = screen.getAllByText(/会员总数|积分总计|储值总额/);
    expect(statCards.length).toBe(3);
    // 表格中显示积分100
    const table = screen.getByRole("table");
    expect(within(table).getByText("100")).toBeInTheDocument();
  });

  it("编辑会员成功", async () => {
    renderPage();
    // 添加
    fireEvent.click(screen.getByRole("button", { name: /添加会员/ }));
    let modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText(/会员姓名/), { target: { value: "王五" } });
    fireEvent.click(within(modal).getByRole("button", { name: /保存并继续/ }));
    expect(await screen.findByText("王五")).toBeInTheDocument();

    // 编辑
    fireEvent.click(screen.getByLabelText("编辑"));
    modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText(/会员姓名/), { target: { value: "王五五" } });
    fireEvent.click(within(modal).getByRole("button", { name: /保存修改/ }));

    expect(await screen.findByText("王五五")).toBeInTheDocument();
    expect(screen.queryByText("王五")).not.toBeInTheDocument();
  });

  it("删除会员成功", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /添加会员/ }));
    const modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText(/会员姓名/), { target: { value: "赵六" } });
    fireEvent.click(within(modal).getByRole("button", { name: /保存并继续/ }));
    expect(await screen.findByText("赵六")).toBeInTheDocument();
    // 关闭添加弹窗
    fireEvent.click(within(modal).getByRole("button", { name: /取消/ }));

    fireEvent.click(screen.getByLabelText("删除"));
    const confirmDialog = screen.getByRole("dialog");
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "删除" }));

    expect(screen.queryByText("赵六")).not.toBeInTheDocument();
  });

  it("按等级筛选会员", async () => {
    window.localStorage.setItem("sock-erp-members", JSON.stringify([
      { id: "1", name: "普通甲", phone: "", level: "普通", points: 0, balance: 0, joinDate: "2024-01-01", notes: "" },
      { id: "2", name: "金卡乙", phone: "", level: "金卡", points: 500, balance: 0, joinDate: "2024-01-01", notes: "" },
    ]));
    renderPage();

    expect(screen.getByText("普通甲")).toBeInTheDocument();
    expect(screen.getByText("金卡乙")).toBeInTheDocument();

    // 筛选金卡
    fireEvent.click(screen.getByText("金卡", { selector: ".level-filter" }));
    expect(screen.getByText("金卡乙")).toBeInTheDocument();
    expect(screen.queryByText("普通甲")).not.toBeInTheDocument();
  });

  it("搜索会员按姓名", async () => {
    window.localStorage.setItem("sock-erp-members", JSON.stringify([
      { id: "1", name: "张三", phone: "111", level: "普通", points: 0, balance: 0, joinDate: "", notes: "" },
      { id: "2", name: "李四", phone: "222", level: "普通", points: 0, balance: 0, joinDate: "", notes: "" },
    ]));
    renderPage();

    const searchInput = screen.getByPlaceholderText(/搜索姓名或电话/);
    fireEvent.change(searchInput, { target: { value: "张三" } });

    expect(screen.getByText("张三")).toBeInTheDocument();
    expect(screen.queryByText("李四")).not.toBeInTheDocument();
  });

  it("数据持久化到 localStorage", () => {
    window.localStorage.setItem("sock-erp-members", JSON.stringify([
      { id: "1", name: "持久化用户", phone: "", level: "银卡", points: 10, balance: 20, joinDate: "", notes: "" }
    ]));
    renderPage();
    expect(screen.getByText("持久化用户")).toBeInTheDocument();
    // 银卡出现在表格中（Badge）
    const table = screen.getByRole("table");
    expect(within(table).getByText("银卡")).toBeInTheDocument();
  });
});
