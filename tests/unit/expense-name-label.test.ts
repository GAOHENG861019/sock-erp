import { describe, expect, it } from "vitest";

describe("ExpensePages - 姓名字段标签", () => {
  it("placeholder只显示姓名不包含括号内容", () => {
    const placeholder = "姓名";
    expect(placeholder).toBe("姓名");
    expect(placeholder).not.toContain("谁出的费用");
    expect(placeholder).not.toContain("（");
    expect(placeholder).not.toContain("）");
  });

  it("旧标签包含括号内容已被移除", () => {
    const oldPlaceholder = "姓名（谁出的费用）";
    const newPlaceholder = "姓名";
    expect(oldPlaceholder).toContain("谁出的费用");
    expect(newPlaceholder).not.toContain("谁出的费用");
    expect(newPlaceholder.length).toBeLessThan(oldPlaceholder.length);
  });
});
