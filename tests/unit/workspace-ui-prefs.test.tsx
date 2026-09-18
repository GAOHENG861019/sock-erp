import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// 可动态调整的 api.state 返回值（undefined 模拟手机 APP 无后端）
let stateResult: any = undefined;

vi.mock("../../src/api", () => ({
  api: {
    state: vi.fn(async () => stateResult),
    saveNow: vi.fn(async () => ({})),
  },
}));

import { WorkspaceProvider, useWorkspace } from "../../src/WorkspaceContext";
import { saveUiPreferences, UI_PREFS_CHANGED_EVENT } from "../../src/ui-preferences";

function Probe() {
  const { data } = useWorkspace();
  return <div data-testid="probe">{JSON.stringify(data.settings)}</div>;
}

function renderProbe() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <WorkspaceProvider>{children}</WorkspaceProvider>
    </QueryClientProvider>
  );
  return render(<Probe />, { wrapper });
}

beforeEach(() => {
  window.localStorage.clear();
  stateResult = undefined;
  // 手机端无后端时 api.state 返回 undefined，React Query v5 会打印这条预期警告，测试中忽略它
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes("Query data cannot be undefined")) return;
    // eslint-disable-next-line no-console
    console.warn(...(args as []));
  });
});

describe("WorkspaceContext 界面偏好兜底", () => {
  it("无后端（手机 APP）时从 localStorage 读取风格/主题", async () => {
    stateResult = undefined;
    saveUiPreferences({ appearance: "notebook", theme: "dark" });

    renderProbe();

    await waitFor(() => {
      const probe = screen.getByTestId("probe");
      expect(probe.textContent).toContain('"appearance":"notebook"');
      expect(probe.textContent).toContain('"theme":"dark"');
    });
  });

  it("后端有值时后端偏好优先于本地", async () => {
    stateResult = {
      planItems: [], clients: [], foods: [], settings: { appearance: "neo", theme: "light" }, trash: [],
    };
    saveUiPreferences({ appearance: "notebook", theme: "dark" });

    renderProbe();

    await waitFor(() => {
      const probe = screen.getByTestId("probe");
      expect(probe.textContent).toContain('"appearance":"neo"');
      expect(probe.textContent).toContain('"theme":"light"');
    });
  });

  it("本地偏好变更事件触发后，无后端环境下立即更新", async () => {
    stateResult = undefined;
    renderProbe();

    await waitFor(() => {
      expect(screen.getByTestId("probe").textContent).toBe("{}");
    });

    act(() => {
      saveUiPreferences({ appearance: "neo" });
    });

    await waitFor(() => {
      expect(screen.getByTestId("probe").textContent).toContain('"appearance":"neo"');
    });
  });

  it("派发变更事件本身也能被监听到", () => {
    let heard = 0;
    const handler = () => { heard += 1; };
    window.addEventListener(UI_PREFS_CHANGED_EVENT, handler);
    act(() => saveUiPreferences({ theme: "dark" }));
    window.removeEventListener(UI_PREFS_CHANGED_EVENT, handler);
    expect(heard).toBe(1);
  });
});
