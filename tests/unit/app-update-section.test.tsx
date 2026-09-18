import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// 可在各用例中切换的平台标志
let nativePlatform = false;

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => nativePlatform,
  },
}));

vi.mock("@capgo/capacitor-updater", () => ({
  CapacitorUpdater: {
    current: vi.fn(async () => ({
      bundle: { id: "builtin", version: "1.3.0", status: "success" },
      native: "1.3.0",
    })),
    download: vi.fn(),
    next: vi.fn(),
    set: vi.fn(),
    notifyAppReady: vi.fn(),
    addListener: vi.fn(),
  },
}));

import { AppUpdateSection } from "../../src/components/AppUpdateSection";

describe("AppUpdateSection 应用更新卡片", () => {
  beforeEach(() => {
    nativePlatform = false;
  });

  it("网页端显示前端构建版本号", async () => {
    render(<AppUpdateSection />);
    const versionLine = await screen.findByText(/前端 v\d+\.\d+\.\d+/);
    expect(versionLine).toBeInTheDocument();
    expect(screen.getByText(/网页 \/ 电脑端/)).toBeInTheDocument();
  });

  it("原生端显示当前 bundle 版本、原生版本与前端构建版本", async () => {
    nativePlatform = true;
    render(<AppUpdateSection />);
    expect(await screen.findByText("当前版本 1.3.0")).toBeInTheDocument();
    expect(screen.getByText(/原生版本 1\.3\.0/)).toBeInTheDocument();
    expect(screen.getByText(/前端 v\d+\.\d+\.\d+/)).toBeInTheDocument();
  });
});
