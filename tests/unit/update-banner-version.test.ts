import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { shouldPromptUpdate, compareVersions } from "../../src/app-update";

const projectRoot = process.cwd();
const layoutSrc = fs.readFileSync(
  path.join(projectRoot, "src", "components", "Layout.tsx"),
  "utf8",
);

describe("shouldPromptUpdate（修复“已更新还一直提醒”的整包更新弹窗）", () => {
  it("云端版本等于当前版本 → 不提醒（已是最新）", () => {
    expect(
      shouldPromptUpdate({ currentVersion: "1.4.5", latestVersion: "1.4.5" }),
    ).toBe(false);
  });

  it("云端版本低于当前版本 → 不提醒", () => {
    expect(
      shouldPromptUpdate({ currentVersion: "1.4.5", latestVersion: "1.4.4" }),
    ).toBe(false);
  });

  it("云端有更高版本且未点过稍后再说 → 提醒", () => {
    expect(
      shouldPromptUpdate({ currentVersion: "1.4.5", latestVersion: "1.4.6" }),
    ).toBe(true);
  });

  it("云端有更高版本但已对该版本点过稍后再说 → 不提醒", () => {
    expect(
      shouldPromptUpdate({
        currentVersion: "1.4.5",
        latestVersion: "1.4.6",
        dismissedVersion: "1.4.6",
      }),
    ).toBe(false);
  });

  it("稍后再说存的是旧版本号时不影响新版本提醒", () => {
    expect(
      shouldPromptUpdate({
        currentVersion: "1.4.5",
        latestVersion: "1.4.6",
        dismissedVersion: "1.4.5",
      }),
    ).toBe(true);
  });

  it("云端版本为空/无效 → 不提醒", () => {
    expect(shouldPromptUpdate({ currentVersion: "1.4.5", latestVersion: null })).toBe(false);
    expect(
      shouldPromptUpdate({ currentVersion: "1.4.5", latestVersion: undefined }),
    ).toBe(false);
  });

  it("跨主/次版本号比较正确", () => {
    expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
    expect(compareVersions("2.0.0", "1.4.5")).toBe(1);
    expect(shouldPromptUpdate({ currentVersion: "2.0.0", latestVersion: "1.9.9" })).toBe(false);
  });
});

describe("Layout.tsx 更新提醒不再使用硬编码版本号", () => {
  it("不再包含硬编码的 currentVersion = 旧版本号", () => {
    expect(layoutSrc).not.toContain('const currentVersion = "1.4.2"');
    expect(layoutSrc).not.toMatch(/currentVersion\s*=\s*"\d+\.\d+\.\d+"/);
  });

  it("使用动态 APP_VERSION 判断是否弹窗", () => {
    expect(layoutSrc).toContain('import { APP_VERSION } from "../version"');
    expect(layoutSrc).toContain("shouldPromptUpdate");
    expect(layoutSrc).toContain("currentVersion: APP_VERSION");
  });

  it("已移除 dismissed 与硬编码版本比较的提前返回", () => {
    expect(layoutSrc).not.toContain("dismissed === currentVersion");
  });
});
