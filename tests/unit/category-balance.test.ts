import { describe, expect, it } from "vitest";

describe("CategoryPage - 余量显示", () => {
  it("余量显示不出现负数", () => {
    const bal = { packages: -2, weightKg: -40 };
    const display = `余量：${Math.max(0, bal.packages)}包 / ${Math.max(0, bal.weightKg)}公斤`;
    expect(display).toBe("余量：0包 / 0公斤");
  });

  it("正常余量显示正确", () => {
    const bal = { packages: 10, weightKg: 50 };
    const display = `余量：${Math.max(0, bal.packages)}包 / ${Math.max(0, bal.weightKg)}公斤`;
    expect(display).toBe("余量：10包 / 50公斤");
  });

  it("标签从库存改为余量", () => {
    const bal = { packages: 5, weightKg: 25 };
    const oldDisplay = `库存：${bal.packages}包 / ${bal.weightKg}公斤`;
    const newDisplay = `余量：${Math.max(0, bal.packages)}包 / ${Math.max(0, bal.weightKg)}公斤`;
    expect(oldDisplay).toContain("库存");
    expect(newDisplay).toContain("余量");
    expect(newDisplay).not.toContain("库存");
  });

  it("分组汇总余量不出现负数", () => {
    const total = { packages: -5, weightKg: -100 };
    const display = `${Math.max(0, total.packages)}包 / ${Math.max(0, total.weightKg)}公斤`;
    expect(display).toBe("0包 / 0公斤");
  });
});
