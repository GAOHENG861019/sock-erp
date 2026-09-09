import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExpenseRecordPage } from "../../src/pages/ExpensePages";

const MACHINE_PROPS = {
  eyebrow: "设备维护",
  title: "机器损耗",
  description: "记录设备维修、保养等损耗费用",
  module: "entertainment" as const,
  storageKey: "sock-erp-machine-loss",
};

const FREIGHT_PROPS = {
  eyebrow: "物流费用",
  title: "运货运费",
  description: "记录发货物流费用",
  module: "diet" as const,
  storageKey: "sock-erp-freight",
};

/** 同步 mock FileReader，readAsDataURL 立即触发 onload */
function mockFileReader(result = "data:image/jpeg;base64,FAKE") {
  const FakeReader = vi.fn(function (this: any) {
    this.onload = null;
    this.result = result;
  });
  FakeReader.prototype.readAsDataURL = function () {
    if (typeof this.onload === "function") this.onload({ target: this });
  };
  vi.stubGlobal("FileReader", FakeReader);
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function addRecord(amount: string, note: string) {
  fireEvent.change(screen.getByPlaceholderText("金额"), { target: { value: amount } });
  fireEvent.change(screen.getByPlaceholderText("备注"), { target: { value: note } });
  fireEvent.click(screen.getByText("添加", { selector: "button" }));
}

describe("机器损耗 (MachineLossPage)", () => {
  it("1. 渲染机器损耗页面，标题显示『机器损耗』", () => {
    render(<ExpenseRecordPage {...MACHINE_PROPS} />);
    expect(screen.getByText("机器损耗")).toBeInTheDocument();
    expect(screen.getByText("设备维护")).toBeInTheDocument();
  });

  it("2. 添加机器损耗记录成功", () => {
    render(<ExpenseRecordPage {...MACHINE_PROPS} />);
    addRecord("100", "维修电机");
    const text = document.body.textContent || "";
    expect(text).toContain("维修电机");
    expect(text).toContain("¥100.00");
  });

  it("3. 删除机器损耗记录成功", () => {
    window.localStorage.setItem(
      MACHINE_PROPS.storageKey,
      JSON.stringify([{ id: "m1", date: "2024-01-01", amount: 200, note: "待删除损耗" }])
    );
    render(<ExpenseRecordPage {...MACHINE_PROPS} />);
    expect(screen.getByText("待删除损耗")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("删除"));
    expect(screen.queryByText("待删除损耗")).not.toBeInTheDocument();
    expect(screen.getByText("还没有支出记录")).toBeInTheDocument();
  });

  it("4. 多条机器损耗记录合计金额正确", () => {
    window.localStorage.setItem(
      MACHINE_PROPS.storageKey,
      JSON.stringify([
        { id: "m1", date: "2024-01-01", amount: 50, note: "电机" },
        { id: "m2", date: "2024-01-02", amount: 80.5, note: "皮带" },
        { id: "m3", date: "2024-01-03", amount: 19.5, note: "轴承" },
      ])
    );
    render(<ExpenseRecordPage {...MACHINE_PROPS} />);
    expect(screen.getByText(/支出合计/)).toHaveTextContent("¥150.00");
  });

  it("5. 图片上传功能存在 (file input accept=image/*)", () => {
    const { container } = render(<ExpenseRecordPage {...MACHINE_PROPS} />);
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
    expect(fileInput?.getAttribute("accept")).toBe("image/*");
  });

  it("6. 空金额不能添加记录", () => {
    render(<ExpenseRecordPage {...MACHINE_PROPS} />);
    fireEvent.click(screen.getByText("添加", { selector: "button" }));
    expect(screen.getByText("还没有支出记录")).toBeInTheDocument();
  });

  it("7. 数据持久化到 localStorage (key: sock-erp-machine-loss)", () => {
    window.localStorage.setItem(
      MACHINE_PROPS.storageKey,
      JSON.stringify([{ id: "m1", date: "2024-01-01", amount: 320, note: "主轴维修" }])
    );
    render(<ExpenseRecordPage {...MACHINE_PROPS} />);
    expect(screen.getByText("主轴维修")).toBeInTheDocument();
    // 新增一条后回写
    addRecord("80", "润滑保养");
    const raw = window.localStorage.getItem(MACHINE_PROPS.storageKey);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.length).toBe(2);
    expect(parsed.some((r: any) => r.note === "主轴维修")).toBe(true);
    expect(parsed.some((r: any) => r.note === "润滑保养")).toBe(true);
  });
});

describe("运货运费 (FreightPage)", () => {
  it("8. 渲染运货运费页面，标题显示『运货运费』", () => {
    render(<ExpenseRecordPage {...FREIGHT_PROPS} />);
    expect(screen.getByText("运货运费")).toBeInTheDocument();
    expect(screen.getByText("物流费用")).toBeInTheDocument();
  });

  it("9. 添加运货运费记录成功", () => {
    render(<ExpenseRecordPage {...FREIGHT_PROPS} />);
    addRecord("350", "发往郑州");
    const text = document.body.textContent || "";
    expect(text).toContain("发往郑州");
    expect(text).toContain("¥350.00");
  });

  it("10. 删除运货运费记录成功", () => {
    window.localStorage.setItem(
      FREIGHT_PROPS.storageKey,
      JSON.stringify([{ id: "f1", date: "2024-02-01", amount: 120, note: "待删除运费" }])
    );
    render(<ExpenseRecordPage {...FREIGHT_PROPS} />);
    expect(screen.getByText("待删除运费")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("删除"));
    expect(screen.queryByText("待删除运费")).not.toBeInTheDocument();
    expect(screen.getByText("还没有支出记录")).toBeInTheDocument();
  });

  it("11. 多条运货运费记录合计正确", () => {
    window.localStorage.setItem(
      FREIGHT_PROPS.storageKey,
      JSON.stringify([
        { id: "f1", date: "2024-02-01", amount: 100, note: "线路A" },
        { id: "f2", date: "2024-02-02", amount: 250.5, note: "线路B" },
      ])
    );
    render(<ExpenseRecordPage {...FREIGHT_PROPS} />);
    expect(screen.getByText(/支出合计/)).toHaveTextContent("¥350.50");
  });

  it("12. 图片上传功能存在", () => {
    const { container } = render(<ExpenseRecordPage {...FREIGHT_PROPS} />);
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
    expect(fileInput?.getAttribute("accept")).toBe("image/*");
  });

  it("13. 数据持久化到 localStorage (key: sock-erp-freight)", () => {
    window.localStorage.setItem(
      FREIGHT_PROPS.storageKey,
      JSON.stringify([{ id: "f1", date: "2024-02-01", amount: 200, note: "原记录" }])
    );
    render(<ExpenseRecordPage {...FREIGHT_PROPS} />);
    expect(screen.getByText("原记录")).toBeInTheDocument();
    addRecord("99", "新记录");
    const raw = window.localStorage.getItem(FREIGHT_PROPS.storageKey);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.length).toBe(2);
    expect(parsed.some((r: any) => r.note === "新记录")).toBe(true);
  });
});

describe("图片上传专项", () => {
  it("14. 选择图片后显示预览 (draft.photo 被设置，出现预览 img)", () => {
    mockFileReader("data:image/jpeg;base64,PREVIEW");
    const { container } = render(<ExpenseRecordPage {...MACHINE_PROPS} />);

    // 初始没有预览图，label 文本为『凭证』
    expect(container.querySelector('img[alt="预览"]')).toBeNull();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["fake image content"], "test.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    // 预览图出现，label 变为『已选』
    const preview = container.querySelector('img[alt="预览"]') as HTMLImageElement;
    expect(preview).not.toBeNull();
    expect(preview.src).toContain("data:image/jpeg;base64,PREVIEW");
    expect(container.textContent).toContain("已选");
  });

  it("15. 添加带照片的记录后，明细表格中显示凭证图片", () => {
    mockFileReader("data:image/jpeg;base64,PHOTO");
    const { container } = render(<ExpenseRecordPage {...MACHINE_PROPS} />);

    // 填金额 + 备注 + 选图
    fireEvent.change(screen.getByPlaceholderText("金额"), { target: { value: "66" } });
    fireEvent.change(screen.getByPlaceholderText("备注"), { target: { value: "带凭证维修" } });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["img"], "receipt.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    // 点击添加
    fireEvent.click(screen.getByText("添加", { selector: "button" }));

    // 明细表格中应出现 alt="凭证" 的图片
    const receiptImg = container.querySelector('img[alt="凭证"]') as HTMLImageElement;
    expect(receiptImg).not.toBeNull();
    expect(receiptImg.src).toContain("data:image/jpeg;base64,PHOTO");
    expect(screen.getByText("带凭证维修")).toBeInTheDocument();

    // localStorage 中持久化了 photo 字段
    const raw = window.localStorage.getItem(MACHINE_PROPS.storageKey);
    const parsed = JSON.parse(raw!);
    expect(parsed.length).toBe(1);
    expect(parsed[0].photo).toBe("data:image/jpeg;base64,PHOTO");
  });
});
