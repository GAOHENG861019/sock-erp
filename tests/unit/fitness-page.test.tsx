import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within, renderHook, act } from "@testing-library/react";
import { FitnessPage, useRawMaterials } from "../../src/pages/FitnessPage";

beforeEach(() => {
  window.localStorage.clear();
});

describe("原材料采购", () => {
  it("显示公斤单位和单价列", () => {
    window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
      { id: "1", name: "棉纱", spec: "32支", weight: 50, unitPrice: 25, amount: 2500, packages: 2 }
    ]));
    render(<FitnessPage />);
    const text = document.body.textContent || "";
    expect(text).toContain("单重(公斤)");
    expect(text).toContain("总重量(公斤)");
    expect(text).toContain("单价(元/公斤)");
    expect(text).toContain("50 公斤");
    // 总重量 = 2包 * 50公斤 = 100公斤
    expect(text).toContain("100.00 公斤");
    expect(text).toContain("¥25.00/公斤");
    // 金额 = 2 * 50 * 25 = 2500
    expect(text).toContain("¥2500.00");
  });

  it("总重量=包数×重量，金额=包数×重量×单价", () => {
    window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
      { id: "1", name: "棉纱", spec: "32支", weight: 50, unitPrice: 20, amount: 2000, packages: 2 },
      { id: "2", name: "橡筋", spec: "宽", weight: 30, unitPrice: 15, amount: 1350, packages: 3 },
    ]));
    render(<FitnessPage />);
    const text = document.body.textContent || "";
    // 总重量 = 2*50 + 3*30 = 100 + 90 = 190公斤
    expect(text).toContain("190.00 公斤");
    // 总额 = 2000 + 1350 = 3350
    expect(text).toContain("¥3350.00");
    // 总包数 = 2 + 3 = 5
    expect(text).toContain("5 包");
  });

  it("无数据时显示空状态", () => {
    render(<FitnessPage />);
    expect(screen.getByText("还没有原材料")).toBeInTheDocument();
  });

  it("添加原材料按钮存在", () => {
    render(<FitnessPage />);
    expect(screen.getByText("添加原材料")).toBeInTheDocument();
  });

  it("原材料总额度显示", () => {
    window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
      { id: "1", name: "棉纱", spec: "32支", weight: 10, unitPrice: 30, amount: 300 },
    ]));
    render(<FitnessPage />);
    const text = document.body.textContent || "";
    expect(text).toContain("原材料总额度");
    expect(text).toContain("¥300.00");
  });

  it("原材料包数显示和统计", () => {
    window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
      { id: "1", name: "棉纱", spec: "32支", weight: 10, unitPrice: 30, amount: 300, packages: 5 },
      { id: "2", name: "橡筋", spec: "40支", weight: 5, unitPrice: 20, amount: 100, packages: 3 },
    ]));
    render(<FitnessPage />);
    const text = document.body.textContent || "";
    expect(text).toContain("总包数");
    expect(text).toContain("8");
    expect(text).toContain("5 包");
    expect(text).toContain("3 包");
  });

  it("添加原材料弹窗包含包数字段", () => {
    render(<FitnessPage />);
    fireEvent.click(screen.getByText("添加原材料"));
    const modal = screen.getByRole("dialog");
    expect(within(modal).getByText("包数")).toBeInTheDocument();
  });

  it("云端数据晚于组件挂载到达后，新增原材料会保留云端已有数据（不整体覆盖）", () => {
    // 1) 组件挂载时本地为空（模拟手机冷启动：React 先挂载，云拉取尚未完成）
    render(<FitnessPage />);
    expect(screen.getByText("还没有原材料")).toBeInTheDocument();

    // 2) 云拉取完成：原始 setItem 写入云端数据并派发同步事件（测试环境未 patch main.tsx）
    const cloudItems = [
      { id: "cloud1", name: "云端棉纱", spec: "21支", weight: 25, packages: 10, unitPrice: 8.4, amount: 2100 },
    ];
    window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify(cloudItems));
    window.dispatchEvent(new CustomEvent("cloud-storage-sync", { detail: { key: "sock-erp-raw-materials", type: "pull" } }));

    // 3) 新增一条原材料
    fireEvent.click(screen.getByText("添加原材料"));
    const modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByPlaceholderText("例如：棉纱、橡筋"), { target: { value: "新采购橡筋" } });
    fireEvent.click(within(modal).getByText("保存并继续"));

    // 4) 本地应同时保留云端数据与新增项，而不是只剩新增的一条
    const stored = JSON.parse(window.localStorage.getItem("sock-erp-raw-materials") || "[]");
    expect(Array.isArray(stored)).toBe(true);
    expect(stored).toHaveLength(2);
    expect(stored.some((i: any) => i.name === "云端棉纱")).toBe(true);
    expect(stored.some((i: any) => i.name === "新采购橡筋")).toBe(true);
  });

  it("原材料支持编辑修改", () => {
    window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
      { id: "1", name: "棉纱", spec: "32支", weight: 10, unitPrice: 30, amount: 300, packages: 5 },
    ]));
    render(<FitnessPage />);
    // 点击编辑按钮
    fireEvent.click(screen.getByTitle("编辑"));
    const modal = screen.getByRole("dialog");
    expect(within(modal).getByText("编辑原材料")).toBeInTheDocument();
    // 修改名称
    const nameInput = within(modal).getByDisplayValue("棉纱");
    fireEvent.change(nameInput, { target: { value: "棉纱2" } });
    fireEvent.click(within(modal).getByText("保存修改"));
    expect(screen.getByText("棉纱2")).toBeInTheDocument();
  });

  it("新增原材料时同步写入 localStorage（不依赖 effect 时序，杜绝云拉取竞态）", () => {
    const { result } = renderHook(() => useRawMaterials());
    act(() => {
      result.current[1]((prev) => [
        ...prev,
        { id: "x1", name: "测试纱", spec: "32支", weight: 10, unitPrice: 5, amount: 50, packages: 1 },
      ]);
      // 关键：在 act 回调内（持久化 effect 尚未 flush）立即断言本地已落盘
      const stored = JSON.parse(window.localStorage.getItem("sock-erp-raw-materials") || "[]");
      expect(stored.some((i: any) => i.id === "x1")).toBe(true);
    });
  });

  it("云拉取事件携带落后数据时，本地刚新增的原材料不被覆盖", () => {
    const { result } = renderHook(() => useRawMaterials());
    // 本地新增一条
    act(() => {
      result.current[1]((prev) => [
        ...prev,
        { id: "local-new", name: "本地新料", spec: "40支", weight: 10, unitPrice: 5, amount: 50, packages: 1 },
      ]);
    });
    // 模拟手机冷启动云拉取在窗口期到达：localStorage 被写成落后的云端数组（不含本地新项）
    window.localStorage.setItem(
      "sock-erp-raw-materials",
      JSON.stringify([{ id: "cloud-old", name: "云端旧料", spec: "21支", weight: 20, unitPrice: 4, amount: 80, packages: 1 }]),
    );
    act(() => {
      window.dispatchEvent(new CustomEvent("cloud-storage-sync", { detail: { key: "sock-erp-raw-materials", type: "pull" } }));
    });
    // 本地新项必须保留，云端项也合并进来
    const ids = result.current[0].map((i) => i.id);
    expect(ids).toContain("local-new");
    expect(ids).toContain("cloud-old");
  });

  it("删除原材料后云事件到达不会把已删除项恢复", () => {
    window.localStorage.setItem("sock-erp-raw-materials", JSON.stringify([
      { id: "keep", name: "保留料", spec: "32支", weight: 1, unitPrice: 1, amount: 1, packages: 1 },
      { id: "gone", name: "待删料", spec: "32支", weight: 1, unitPrice: 1, amount: 1, packages: 1 },
    ]));
    const { result } = renderHook(() => useRawMaterials());
    act(() => {
      result.current[1]((prev) => prev.filter((i) => i.id !== "gone"));
    });
    // 删除已同步落盘：localStorage 也不含 gone
    const storedIds = JSON.parse(window.localStorage.getItem("sock-erp-raw-materials") || "[]").map((i: any) => i.id);
    expect(storedIds).not.toContain("gone");
    // 云事件携带与本地一致的数据，不应恢复 gone
    act(() => {
      window.dispatchEvent(new CustomEvent("cloud-storage-sync", { detail: { key: "sock-erp-raw-materials", type: "pull" } }));
    });
    expect(result.current[0].map((i) => i.id)).not.toContain("gone");
  });
});
