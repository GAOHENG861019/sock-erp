import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { FitnessPage } from "../../src/pages/FitnessPage";
import { CategoryPage } from "../../src/pages/CategoryPage";
import { MemberPage } from "../../src/pages/MemberPage";

beforeEach(() => {
  window.localStorage.clear();
});

describe("连续输入功能", () => {
  describe("原材料采购 - 连续添加", () => {
    it("添加后弹窗保持打开，表单重置，可继续添加下一条", async () => {
      render(<FitnessPage />);

      // 打开添加弹窗
      fireEvent.click(screen.getByRole("button", { name: /添加原材料/ }));
      const modal = screen.getByRole("dialog");
      expect(within(modal).getByText("添加原材料")).toBeInTheDocument();

      // 填写第一条
      const inputs = modal.querySelectorAll("input");
      fireEvent.change(inputs[0], { target: { value: "棉纱" } });
      fireEvent.change(inputs[2], { target: { value: "5" } });
      fireEvent.change(inputs[3], { target: { value: "20" } });
      fireEvent.change(inputs[5], { target: { value: "10" } });

      // 点击"保存并继续"
      fireEvent.click(within(modal).getByText("保存并继续"));

      // 弹窗应该仍然打开
      const modal2 = screen.getByRole("dialog");
      expect(modal2).not.toBeNull();

      // 表单应该被重置（名称为空）
      const inputsAfter = modal2.querySelectorAll("input");
      expect((inputsAfter[0] as HTMLInputElement).value).toBe("");

      // 第一条应该已添加到列表
      expect(await screen.findByText("棉纱")).toBeInTheDocument();

      // 填写第二条
      fireEvent.change(inputsAfter[0], { target: { value: "橡筋" } });
      fireEvent.click(within(modal2).getByText("保存并继续"));

      // 两条都应该在列表中
      expect(await screen.findByText("橡筋")).toBeInTheDocument();
      expect(screen.getByText("棉纱")).toBeInTheDocument();
    });

    it("编辑后弹窗关闭", () => {
      window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
        { id: "1", name: "棉纱", spec: "32支", weight: 50, unitPrice: 25, amount: 2500, packages: 2 }
      ]));
      render(<FitnessPage />);

      // 点击编辑
      fireEvent.click(screen.getByTitle("编辑"));
      const modal = screen.getByRole("dialog");
      expect(within(modal).getByText("编辑原材料")).toBeInTheDocument();

      // 点击保存修改
      fireEvent.click(within(modal).getByText("保存修改"));

      // 弹窗应该关闭
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  describe("分类中心 - 连续添加", () => {
    it("添加分类后弹窗保持打开，可继续添加", async () => {
      render(<CategoryPage />);

      // 打开添加弹窗
      fireEvent.click(screen.getByRole("button", { name: /添加商品分类/ }));
      const modal = screen.getByRole("dialog");

      // 填写分类名称
      const nameInput = within(modal).getByLabelText(/分类名称/);
      fireEvent.change(nameInput, { target: { value: "棉袜" } });

      // 点击保存并继续
      fireEvent.click(within(modal).getByRole("button", { name: /保存并继续/ }));

      // 弹窗应该仍然打开
      expect(screen.getByRole("dialog")).not.toBeNull();

      // 分类应该已添加
      expect(await screen.findByText("棉袜")).toBeInTheDocument();
    });
  });

  describe("会员管理 - 连续添加", () => {
    it("添加会员后弹窗保持打开，可继续添加", async () => {
      render(<MemberPage />);

      // 打开添加弹窗
      fireEvent.click(screen.getByRole("button", { name: /添加会员/ }));
      const modal = screen.getByRole("dialog");
      expect(within(modal).getByText("添加会员")).toBeInTheDocument();

      // 填写会员名称
      const nameInput = within(modal).getByLabelText(/姓名/);
      fireEvent.change(nameInput, { target: { value: "张三" } });

      // 点击保存并继续
      fireEvent.click(within(modal).getByRole("button", { name: /保存并继续/ }));

      // 弹窗应该仍然打开
      expect(screen.getByRole("dialog")).not.toBeNull();

      // 会员应该已添加
      expect(await screen.findByText("张三")).toBeInTheDocument();
    });
  });
});
