import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductionRecordPage, DingxingPage } from "../../src/pages/ProductionRecordPage";

beforeEach(() => {
  window.localStorage.clear();
});

function text() {
  return document.body.textContent || "";
}

describe("生产记录-单位显示", () => {
  it("翻袜录入框显示公斤单位", () => {
    render(<ProductionRecordPage eyebrow="生产工序" title="翻袜" description="测试" module="today" storageKey="test-fanwa" />);
    expect(screen.getByPlaceholderText("数量(公斤)")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("单价(元/公斤)")).toBeInTheDocument();
  });

  it("翻袜记录表格和汇总显示公斤", () => {
    window.localStorage.setItem("test-fanwa", JSON.stringify([
      { id: "1", name: "张三", spec: "双", quantity: 10, unitPrice: 5 }
    ]));
    render(<ProductionRecordPage eyebrow="生产工序" title="翻袜" description="测试" module="today" storageKey="test-fanwa" />);

    const pageText = text();
    expect(pageText).toContain("张三");
    expect(pageText).toContain("10 公斤");
    expect(pageText).toContain("¥5.00/公斤");
    expect(pageText).toContain("数量(公斤)");
    expect(pageText).toContain("单价(元/公斤)");
    expect(pageText).toContain("本人小计数量");
    expect(pageText).toContain("总数量");
  });

  it("翻袜多条记录汇总正确", () => {
    window.localStorage.setItem("test-fanwa", JSON.stringify([
      { id: "1", name: "甲", spec: "双", quantity: 10, unitPrice: 5 },
      { id: "2", name: "乙", spec: "双", quantity: 15, unitPrice: 4 },
    ]));
    render(<ProductionRecordPage eyebrow="生产工序" title="翻袜" description="测试" module="today" storageKey="test-fanwa" />);
    const pageText = text();
    expect(pageText).toContain("25 公斤");
    expect(pageText).toContain("¥110.00");
  });

  it("定型页面显示公斤单位", () => {
    render(<DingxingPage module="development" />);
    expect(screen.getByPlaceholderText("数量(公斤)")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("单价(元/公斤)")).toBeInTheDocument();
  });

  it("定型记录表格和汇总显示公斤", () => {
    window.localStorage.setItem("sock-erp-dingxing", JSON.stringify([
      { id: "1", name: "王五", color: "白色", spec: "双", quantity: 15, unitPrice: 4 }
    ]));
    render(<DingxingPage module="development" />);

    const pageText = text();
    expect(pageText).toContain("王五");
    expect(pageText).toContain("15 公斤");
    expect(pageText).toContain("¥4.00/公斤");
    expect(pageText).toContain("颜色小计数量");
    expect(pageText).toContain("定型总数");
  });

  it("定型按颜色分组", () => {
    window.localStorage.setItem("sock-erp-dingxing", JSON.stringify([
      { id: "1", name: "A", color: "白色", spec: "双", quantity: 10, unitPrice: 3 },
      { id: "2", name: "B", color: "黑色", spec: "双", quantity: 20, unitPrice: 3 },
    ]));
    render(<DingxingPage module="development" />);
    const pageText = text();
    expect(pageText).toContain("颜色：白色");
    expect(pageText).toContain("颜色：黑色");
    expect(pageText).toContain("30 公斤");
  });
});
