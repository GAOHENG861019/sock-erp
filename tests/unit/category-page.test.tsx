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
});
