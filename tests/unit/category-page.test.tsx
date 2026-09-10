import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { CategoryPage } from "../../src/pages/CategoryPage";

function renderPage() {
  return render(<CategoryPage />);
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("分类中心页面", () => {
  it("渲染页面标题和两个分类标签", () => {
    renderPage();
    expect(screen.getByText("分类中心")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /商品分类/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /原材料分类/ })).toBeInTheDocument();
  });

  it("默认显示商品分类，空状态提示", () => {
    renderPage();
    expect(screen.getByText("暂无分类")).toBeInTheDocument();
    expect(screen.getByText(/还没有商品分类/)).toBeInTheDocument();
  });

  it("切换到原材料分类标签", () => {
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: /原材料分类/ }));
    expect(screen.getByText(/还没有原材料分类/)).toBeInTheDocument();
  });

  it("添加商品分类成功", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /添加商品分类/ }));

    const modal = screen.getByRole("dialog");
    const nameInput = within(modal).getByLabelText(/分类名称/);
    fireEvent.change(nameInput, { target: { value: "棉袜" } });

    const descInput = within(modal).getByLabelText(/分类说明/);
    fireEvent.change(descInput, { target: { value: "纯棉袜子" } });

    fireEvent.click(within(modal).getByRole("button", { name: /添加分类/ }));

    expect(await screen.findByText("棉袜")).toBeInTheDocument();
    expect(screen.getByText("纯棉袜子")).toBeInTheDocument();
  });

  it("添加原材料分类成功", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: /原材料分类/ }));
    fireEvent.click(screen.getByRole("button", { name: /添加原材料分类/ }));

    const modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText(/分类名称/), { target: { value: "纱线" } });
    fireEvent.click(within(modal).getByRole("button", { name: /添加分类/ }));

    expect(await screen.findByText("纱线")).toBeInTheDocument();
  });

  it("编辑分类成功", async () => {
    renderPage();
    // 添加一个分类
    fireEvent.click(screen.getByRole("button", { name: /添加商品分类/ }));
    let modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText(/分类名称/), { target: { value: "旧名称" } });
    fireEvent.click(within(modal).getByRole("button", { name: /添加分类/ }));
    expect(await screen.findByText("旧名称")).toBeInTheDocument();

    // 点击编辑
    fireEvent.click(screen.getByLabelText("编辑"));
    modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText(/分类名称/), { target: { value: "新名称" } });
    fireEvent.click(within(modal).getByRole("button", { name: /保存修改/ }));

    expect(await screen.findByText("新名称")).toBeInTheDocument();
    expect(screen.queryByText("旧名称")).not.toBeInTheDocument();
  });

  it("删除分类成功", async () => {
    renderPage();
    // 添加一个分类
    fireEvent.click(screen.getByRole("button", { name: /添加商品分类/ }));
    const modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText(/分类名称/), { target: { value: "待删除" } });
    fireEvent.click(within(modal).getByRole("button", { name: /添加分类/ }));
    expect(await screen.findByText("待删除")).toBeInTheDocument();

    // 点击删除图标
    fireEvent.click(screen.getByLabelText("删除"));
    // 在确认弹窗中点击删除按钮
    const confirmDialog = screen.getByRole("dialog");
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "删除" }));

    expect(screen.queryByText("待删除")).not.toBeInTheDocument();
  });

  it("数据持久化到 localStorage", () => {
    window.localStorage.setItem("sock-erp-product-categories", JSON.stringify([
      { id: "1", name: "运动袜", description: "", sortOrder: 0, createdAt: "2024-01-01" }
    ]));
    renderPage();
    expect(screen.getByText("运动袜")).toBeInTheDocument();
  });

  it("商品分类和原材料分类数据独立", async () => {
    renderPage();
    // 添加商品分类
    fireEvent.click(screen.getByRole("button", { name: /添加商品分类/ }));
    let modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText(/分类名称/), { target: { value: "商品A" } });
    fireEvent.click(within(modal).getByRole("button", { name: /添加分类/ }));
    expect(await screen.findByText("商品A")).toBeInTheDocument();

    // 切换到原材料，不应看到商品A
    fireEvent.click(screen.getByRole("tab", { name: /原材料分类/ }));
    expect(screen.queryByText("商品A")).not.toBeInTheDocument();
    expect(screen.getByText("暂无分类")).toBeInTheDocument();
  });

  it("添加分类后序号自动排列", async () => {
    renderPage();
    // 添加第一个分类
    fireEvent.click(screen.getByRole("button", { name: /添加商品分类/ }));
    let modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText(/分类名称/), { target: { value: "第一个" } });
    fireEvent.click(within(modal).getByRole("button", { name: /添加分类/ }));
    expect(await screen.findByText("第一个")).toBeInTheDocument();

    // 添加第二个分类
    fireEvent.click(screen.getByRole("button", { name: /添加商品分类/ }));
    modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText(/分类名称/), { target: { value: "第二个" } });
    fireEvent.click(within(modal).getByRole("button", { name: /添加分类/ }));
    expect(await screen.findByText("第二个")).toBeInTheDocument();

    // 序号应显示1和2
    const text = document.body.textContent || "";
    expect(text).toContain("1");
    expect(text).toContain("2");

    // localStorage中sortOrder应自动分配
    const saved = JSON.parse(window.localStorage.getItem("sock-erp-product-categories") || "[]");
    expect(saved.length).toBe(2);
    expect(saved[0].sortOrder).toBe(1);
    expect(saved[1].sortOrder).toBe(2);
  });

  it("拖拽排序后序号重新排列", () => {
    window.localStorage.setItem("sock-erp-product-categories", JSON.stringify([
      { id: "a", name: "甲", description: "", sortOrder: 1, createdAt: "2024-01-01" },
      { id: "b", name: "乙", description: "", sortOrder: 2, createdAt: "2024-01-01" },
      { id: "c", name: "丙", description: "", sortOrder: 3, createdAt: "2024-01-01" },
    ]));
    renderPage();

    const items = screen.getAllByText(/甲|乙|丙/);
    expect(items.length).toBeGreaterThanOrEqual(3);

    // 模拟拖拽：把第一个(甲)拖到第三个(丙)的位置
    const categoryItems = document.querySelectorAll(".category-item");
    expect(categoryItems.length).toBe(3);

    const firstItem = categoryItems[0] as HTMLElement;
    const thirdItem = categoryItems[2] as HTMLElement;

    fireEvent.dragStart(firstItem, { dataTransfer: { effectAllowed: "move", setData: () => {} } });
    fireEvent.dragOver(thirdItem, { preventDefault: () => {}, dataTransfer: { dropEffect: "move" } });
    fireEvent.drop(thirdItem, { preventDefault: () => {}, dataTransfer: { dropEffect: "move" } });
    fireEvent.dragEnd(firstItem);

    // 拖拽后顺序应为：乙、丙、甲，序号重新排列为1,2,3
    const saved = JSON.parse(window.localStorage.getItem("sock-erp-product-categories") || "[]");
    expect(saved.length).toBe(3);
    expect(saved[0].name).toBe("乙");
    expect(saved[1].name).toBe("丙");
    expect(saved[2].name).toBe("甲");
    expect(saved[0].sortOrder).toBe(1);
    expect(saved[1].sortOrder).toBe(2);
    expect(saved[2].sortOrder).toBe(3);
  });

  it("删除分类后序号重新排列", async () => {
    renderPage();
    // 添加3个分类
    for (const name of ["A", "B", "C"]) {
      fireEvent.click(screen.getByRole("button", { name: /添加商品分类/ }));
      const modal = screen.getByRole("dialog");
      fireEvent.change(within(modal).getByLabelText(/分类名称/), { target: { value: name } });
      fireEvent.click(within(modal).getByRole("button", { name: /添加分类/ }));
      await screen.findByText(name);
    }

    // 删除第二个
    const deleteButtons = screen.getAllByLabelText("删除");
    fireEvent.click(deleteButtons[1]);
    const confirmDialog = screen.getByRole("dialog");
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "删除" }));

    // 剩余2个，序号应为1,2
    const saved = JSON.parse(window.localStorage.getItem("sock-erp-product-categories") || "[]");
    expect(saved.length).toBe(2);
    expect(saved[0].sortOrder).toBe(1);
    expect(saved[1].sortOrder).toBe(2);
  });

  it("商品分类表单包含关联定型下拉框", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /添加商品分类/ }));
    const modal = screen.getByRole("dialog");
    expect(within(modal).getByLabelText(/关联定型/)).toBeInTheDocument();
  });

  it("原材料分类表单包含关联原材料下拉框", () => {
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: /原材料分类/ }));
    fireEvent.click(screen.getByRole("button", { name: /添加原材料分类/ }));
    const modal = screen.getByRole("dialog");
    expect(within(modal).getByLabelText(/关联原材料/)).toBeInTheDocument();
  });

  it("添加商品分类时选择关联定型，保存后卡片显示关联信息", async () => {
    window.localStorage.setItem("sock-erp-dingxing", JSON.stringify([
      { id: "dx1", name: "张三", color: "白色", spec: "双", quantity: 100, unitPrice: 5 },
    ]));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /添加商品分类/ }));
    const modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText(/分类名称/), { target: { value: "船袜" } });
    fireEvent.change(within(modal).getByLabelText(/关联定型/), { target: { value: "dx1" } });
    fireEvent.click(within(modal).getByRole("button", { name: /添加分类/ }));

    expect(await screen.findByText("船袜")).toBeInTheDocument();
    expect(screen.getByText(/关联：白色 \/ 双/)).toBeInTheDocument();
  });

  it("添加原材料分类时选择关联原材料，保存后卡片显示关联信息", async () => {
    window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
      { id: "rm1", name: "3075纱线", spec: "18D", weight: 1, unitPrice: 20, amount: 20 },
    ]));
    renderPage();

    fireEvent.click(screen.getByRole("tab", { name: /原材料分类/ }));
    fireEvent.click(screen.getByRole("button", { name: /添加原材料分类/ }));
    const modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText(/分类名称/), { target: { value: "纱线分类" } });
    fireEvent.change(within(modal).getByLabelText(/关联原材料/), { target: { value: "rm1" } });
    fireEvent.click(within(modal).getByRole("button", { name: /添加分类/ }));

    expect(await screen.findByText("纱线分类")).toBeInTheDocument();
    expect(screen.getByText(/关联：3075纱线/)).toBeInTheDocument();
  });

  it("编辑分类时可以修改关联项", async () => {
    window.localStorage.setItem("sock-erp-dingxing", JSON.stringify([
      { id: "dx1", name: "张三", color: "白色", spec: "双", quantity: 100, unitPrice: 5 },
      { id: "dx2", name: "李四", color: "黑色", spec: "包", quantity: 50, unitPrice: 10 },
    ]));
    renderPage();

    // 先添加并关联 dx1
    fireEvent.click(screen.getByRole("button", { name: /添加商品分类/ }));
    let modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText(/分类名称/), { target: { value: "船袜" } });
    fireEvent.change(within(modal).getByLabelText(/关联定型/), { target: { value: "dx1" } });
    fireEvent.click(within(modal).getByRole("button", { name: /添加分类/ }));
    expect(await screen.findByText(/关联：白色 \/ 双/)).toBeInTheDocument();

    // 编辑，改为关联 dx2
    fireEvent.click(screen.getByLabelText("编辑"));
    modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText(/关联定型/), { target: { value: "dx2" } });
    fireEvent.click(within(modal).getByRole("button", { name: /保存修改/ }));

    expect(await screen.findByText(/关联：黑色 \/ 包/)).toBeInTheDocument();
    expect(screen.queryByText(/关联：白色 \/ 双/)).not.toBeInTheDocument();
  });

  it("不选择关联时分类卡片不显示关联信息", async () => {
    window.localStorage.setItem("sock-erp-dingxing", JSON.stringify([
      { id: "dx1", name: "张三", color: "白色", spec: "双", quantity: 100, unitPrice: 5 },
    ]));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /添加商品分类/ }));
    const modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByLabelText(/分类名称/), { target: { value: "无关联分类" } });
    fireEvent.click(within(modal).getByRole("button", { name: /添加分类/ }));

    expect(await screen.findByText("无关联分类")).toBeInTheDocument();
    expect(screen.queryByText(/关联：/)).not.toBeInTheDocument();
  });

  it("关联数据从 localStorage 正确读取为下拉选项", () => {
    window.localStorage.setItem("sock-erp-dingxing", JSON.stringify([
      { id: "dx1", name: "张三", color: "白色", spec: "双", quantity: 100, unitPrice: 5 },
    ]));
    window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
      { id: "rm1", name: "3075纱线", spec: "18D", weight: 1, unitPrice: 20, amount: 20 },
    ]));
    renderPage();

    // 商品分类表单：关联定型下拉应包含定型记录选项
    fireEvent.click(screen.getByRole("button", { name: /添加商品分类/ }));
    let modal = screen.getByRole("dialog");
    const productSelect = within(modal).getByLabelText(/关联定型/) as HTMLSelectElement;
    expect(within(productSelect).getByText("白色 - 双 - 张三")).toBeInTheDocument();
    fireEvent.click(within(modal).getByRole("button", { name: "取消" }));

    // 原材料分类表单：关联原材料下拉应包含原材料记录选项
    fireEvent.click(screen.getByRole("tab", { name: /原材料分类/ }));
    fireEvent.click(screen.getByRole("button", { name: /添加原材料分类/ }));
    modal = screen.getByRole("dialog");
    const materialSelect = within(modal).getByLabelText(/关联原材料/) as HTMLSelectElement;
    expect(within(materialSelect).getByText("3075纱线 - 18D")).toBeInTheDocument();
  });

  it("原材料分类显示关联仓库的包数和公斤数", () => {
    window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
      { id: "rm1", name: "3075纱线", spec: "18D", weight: 100, unitPrice: 20, amount: 2000, packages: 10 },
    ]));
    window.localStorage.setItem("sock-erp-material-inventory", JSON.stringify([
      { id: "mi1", linkedId: "rm1", quantity: 100, packages: 10, type: "in", date: "2024-01-01" },
      { id: "mi2", linkedId: "rm1", quantity: 20, packages: 2, type: "out", date: "2024-01-02" },
    ]));
    window.localStorage.setItem("sock-erp-material-categories", JSON.stringify([
      { id: "c1", name: "纱线类", description: "", sortOrder: 1, createdAt: "2024-01-01", linkedId: "rm1" },
    ]));
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: /原材料分类/ }));
    const text = document.body.textContent || "";
    // 10-2=8包, 100-20=80公斤
    expect(text).toContain("8包");
    expect(text).toContain("80公斤");
  });

  it("商品分类显示关联仓库成品的包数和公斤数", () => {
    window.localStorage.setItem("sock-erp-dingxing", JSON.stringify([
      { id: "dx1", name: "张三", color: "白色", spec: "包", quantity: 100, unitPrice: 5 },
    ]));
    window.localStorage.setItem("sock-erp-finished-inventory", JSON.stringify([
      { id: "fi1", linkedId: "dx1", quantity: 50, weightKg: 100, type: "in", date: "2024-01-01" },
    ]));
    window.localStorage.setItem("sock-erp-product-categories", JSON.stringify([
      { id: "c1", name: "棉袜", description: "", sortOrder: 1, createdAt: "2024-01-01", linkedId: "dx1" },
    ]));
    renderPage();
    const text = document.body.textContent || "";
    expect(text).toContain("50包");
    expect(text).toContain("100公斤");
  });
});
