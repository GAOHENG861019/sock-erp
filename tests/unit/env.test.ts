import { describe, it, expect } from "vitest";

describe("测试环境验证", () => {
  it("vitest 正常运行", () => {
    expect(1 + 1).toBe(2);
  });

  it("localStorage mock 可用", () => {
    window.localStorage.setItem("test-key", "test-value");
    expect(window.localStorage.getItem("test-key")).toBe("test-value");
  });
});
