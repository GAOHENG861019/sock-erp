import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog, EmptyState, EntityForm, ErrorState, Modal, Skeleton } from "../../src/components/ui";

function ModalHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>打开弹窗</button>
      <Modal open={open} title="键盘操作" description="验证焦点不会离开弹窗" onClose={() => setOpen(false)}>
        <button>继续操作</button>
      </Modal>
    </>
  );
}

// 模拟会破坏 position:fixed 的祖先（页面过渡/自动化注入常带 transform）
function TransformedModalHarness() {
  const [open, setOpen] = useState(false);
  return (
    <div className="transform-scope" style={{ transform: "translateZ(0)" }}>
      <button onClick={() => setOpen(true)}>打开高弹窗</button>
      <Modal open={open} title="高弹窗" onClose={() => setOpen(false)}>
        <input aria-label="名称" />
      </Modal>
    </div>
  );
}

describe("shared interaction components", () => {
  it("validates required fields and converts numeric input before saving", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    render(<EntityForm fields={[{ name: "title", label: "标题", required: true }, { name: "minutes", label: "分钟", type: "number" }]} onSubmit={onSubmit} onCancel={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByText("请填写此项")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/标题/), "专注开发");
    await user.type(screen.getByLabelText(/分钟/), "45");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onSubmit).toHaveBeenCalledWith({ title: "专注开发", minutes: 45 });
  });

  it("provides explicit empty, loading and error states", () => {
    const { rerender } = render(<EmptyState title="没有记录" description="添加第一条记录" />);
    expect(screen.getByText("没有记录")).toBeInTheDocument();
    rerender(<Skeleton lines={3} />);
    expect(screen.getByLabelText("正在加载").children).toHaveLength(3);
    rerender(<ErrorState message="数据文件不可写" />);
    expect(screen.getByRole("alert")).toHaveTextContent("数据文件不可写");
  });

  it("does not run a destructive action when confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn(async () => undefined);
    render(<ConfirmDialog open title="永久删除这条记录？" description="删除后无法恢复" confirmLabel="永久删除" danger onClose={onClose} onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("traps keyboard focus inside a modal and restores it after closing", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    const trigger = screen.getByRole("button", { name: "打开弹窗" });
    await user.click(trigger);
    const close = screen.getByRole("button", { name: "关闭" });
    await waitFor(() => expect(close).toHaveFocus());
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "继续操作" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("通过 Portal 把弹窗挂到 document.body，脱离带 transform 的祖先容器", async () => {
    const user = userEvent.setup();
    render(<TransformedModalHarness />);
    await user.click(screen.getByRole("button", { name: "打开高弹窗" }));
    const dialog = await screen.findByRole("dialog");
    const backdrop = document.querySelector(".modal-backdrop");
    expect(backdrop).not.toBeNull();
    // 弹窗不应留在带 transform 的祖先内（否则 fixed 定位会被限制，高弹窗顶部溢出）
    expect(dialog.closest(".transform-scope")).toBeNull();
    // 默认（非 neo）主题下，遮罩层直接挂在 body 下
    expect(backdrop!.parentElement).toBe(document.body);
  });

  it("关闭弹窗后移除 Portal 节点", async () => {
    const user = userEvent.setup();
    render(<TransformedModalHarness />);
    await user.click(screen.getByRole("button", { name: "打开高弹窗" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.querySelector(".modal-backdrop")).toBeNull();
  });

  it("neo 主题下 Portal 外层补 neo-shell 容器以保留主题样式", async () => {
    document.documentElement.dataset.appearance = "neo";
    try {
      const user = userEvent.setup();
      render(<ModalHarness />);
      await user.click(screen.getByRole("button", { name: "打开弹窗" }));
      const dialog = await screen.findByRole("dialog");
      const wrapper = dialog.closest(".neo-shell");
      expect(wrapper).not.toBeNull();
      expect(wrapper!.parentElement).toBe(document.body);
    } finally {
      delete document.documentElement.dataset.appearance;
    }
  });
});
