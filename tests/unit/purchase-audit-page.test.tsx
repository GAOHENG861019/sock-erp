import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PurchaseAuditPage } from "../../src/pages/PurchaseAuditPage";

function renderPage() {
  return render(<PurchaseAuditPage />);
}

function seedRequest(overrides: Partial<any> = {}) {
  const base = {
    id: "test-1",
    title: "测试采购单",
    requester: "张三",
    items: [{ name: "纱线", spec: "100支", quantity: 10, unitPrice: 5 }],
    totalAmount: 50,
    notes: "",
    status: "pending" as const,
    createdAt: "2024-01-15T10:00:00.000Z",
  };
  return { ...base, ...overrides };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("采购审核页面", () => {
  it("渲染页面标题和统计卡片", () => {
    renderPage();
    expect(screen.getByText("采购审核")).toBeInTheDocument();
    expect(screen.getAllByText("待审核").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("已通过").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("已驳回").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("已通过金额")).toBeInTheDocument();
  });

  it("空状态提示", () => {
    renderPage();
    expect(screen.getByText("暂无采购申请")).toBeInTheDocument();
  });

  it("新建采购申请成功", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /新建采购申请/ }));

    const modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByPlaceholderText(/如：9月原材料采购/), { target: { value: "9月采购" } });
    fireEvent.change(within(modal).getByPlaceholderText(/申请人姓名/), { target: { value: "李四" } });

    // 填写物品明细
    const nameInputs = within(modal).getAllByPlaceholderText("物品名称");
    fireEvent.change(nameInputs[0], { target: { value: "棉纱" } });
    const qtyInputs = within(modal).getAllByPlaceholderText("数量");
    fireEvent.change(qtyInputs[0], { target: { value: "20" } });
    const priceInputs = within(modal).getAllByPlaceholderText("单价");
    fireEvent.change(priceInputs[0], { target: { value: "3.5" } });

    fireEvent.click(within(modal).getByRole("button", { name: /提交申请/ }));

    expect(await screen.findByText("9月采购")).toBeInTheDocument();
    expect(screen.getByText("¥70.00")).toBeInTheDocument();
  });

  it("审核通过采购申请", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("sock-erp-purchase-audits", JSON.stringify([seedRequest()]));
    renderPage();

    expect(screen.getByText("测试采购单")).toBeInTheDocument();
    await user.click(screen.getByText("通过", { selector: ".audit-btn.approve" }));

    const reviewModal = screen.getByRole("dialog");
    expect(within(reviewModal).getByText("审核通过")).toBeInTheDocument();
    // 用 fireEvent.change 设置中文值（userEvent.type 对中文支持不完整）
    fireEvent.change(within(reviewModal).getByPlaceholderText("审核人姓名"), { target: { value: "王经理" } });
    await user.click(within(reviewModal).getByText("确认通过", { selector: "button" }));

    // 弹窗关闭
    expect(screen.queryByText("审核通过")).not.toBeInTheDocument();
    // localStorage 中状态变为 approved，审核人为王经理
    const saved = JSON.parse(window.localStorage.getItem("sock-erp-purchase-audits") || "[]");
    expect(saved[0].status).toBe("approved");
    expect(saved[0].reviewer).toBe("王经理");
  });

  it("审核驳回采购申请", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("sock-erp-purchase-audits", JSON.stringify([seedRequest()]));
    renderPage();

    await user.click(screen.getByText("驳回", { selector: ".audit-btn.reject" }));

    const reviewModal = screen.getByRole("dialog");
    expect(within(reviewModal).getByText("审核驳回")).toBeInTheDocument();
    fireEvent.change(within(reviewModal).getByPlaceholderText("可选，填写审核意见"), { target: { value: "价格过高" } });
    await user.click(within(reviewModal).getByText("确认驳回", { selector: "button" }));

    // 弹窗关闭
    expect(screen.queryByText("审核驳回")).not.toBeInTheDocument();
    // localStorage 中状态变为 rejected
    const saved = JSON.parse(window.localStorage.getItem("sock-erp-purchase-audits") || "[]");
    expect(saved[0].status).toBe("rejected");
    expect(saved[0].reviewComment).toBe("价格过高");
  });

  it("按状态筛选", () => {
    window.localStorage.setItem("sock-erp-purchase-audits", JSON.stringify([
      seedRequest({ id: "1", title: "待审核单", status: "pending" }),
      seedRequest({ id: "2", title: "已通过单", status: "approved" }),
      seedRequest({ id: "3", title: "已驳回单", status: "rejected" }),
    ]));
    renderPage();

    expect(screen.getByText("待审核单")).toBeInTheDocument();
    expect(screen.getByText("已通过单")).toBeInTheDocument();
    expect(screen.getByText("已驳回单")).toBeInTheDocument();

    // 筛选待审核
    fireEvent.click(screen.getByText("待审核", { selector: ".level-filter" }));
    expect(screen.getByText("待审核单")).toBeInTheDocument();
    expect(screen.queryByText("已通过单")).not.toBeInTheDocument();
  });

  it("删除采购申请", async () => {
    window.localStorage.setItem("sock-erp-purchase-audits", JSON.stringify([seedRequest()]));
    renderPage();

    expect(screen.getByText("测试采购单")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("删除"));

    const confirmDialog = screen.getByRole("dialog");
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "删除" }));

    expect(screen.queryByText("测试采购单")).not.toBeInTheDocument();
  });

  it("查看采购申请详情", async () => {
    window.localStorage.setItem("sock-erp-purchase-audits", JSON.stringify([seedRequest()]));
    renderPage();

    fireEvent.click(screen.getByLabelText("查看详情"));
    const modal = screen.getByRole("dialog");
    expect(within(modal).getByText("采购申请详情")).toBeInTheDocument();
    expect(within(modal).getByText("纱线")).toBeInTheDocument();
    expect(within(modal).getAllByText("¥50.00").length).toBeGreaterThanOrEqual(1);
  });

  it("统计卡片数据正确", () => {
    window.localStorage.setItem("sock-erp-purchase-audits", JSON.stringify([
      seedRequest({ id: "1", status: "pending", totalAmount: 100 }),
      seedRequest({ id: "2", status: "approved", totalAmount: 200 }),
      seedRequest({ id: "3", status: "approved", totalAmount: 300 }),
      seedRequest({ id: "4", status: "rejected", totalAmount: 50 }),
    ]));
    renderPage();

    // 待审核1，已通过2，已驳回1，已通过金额500
    const statValues = screen.getAllByText(/^[0-9]+$/);
    expect(statValues.length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("¥500.00")).toBeInTheDocument();
  });

  it("数据持久化到 localStorage", () => {
    window.localStorage.setItem("sock-erp-purchase-audits", JSON.stringify([
      seedRequest({ title: "持久化采购单" })
    ]));
    renderPage();
    expect(screen.getByText("持久化采购单")).toBeInTheDocument();
  });
});
