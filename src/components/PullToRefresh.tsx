import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowClockwise } from "@phosphor-icons/react";
import { PullToRefreshController, PULL_THRESHOLD, type PullState } from "../pull-refresh";
import { cloudStorage } from "../sync";
import { isNativeApp } from "../plugins/AppUpdate";

/** 仅在触摸设备（原生 APP 或手机浏览器）启用，桌面端不受影响 */
function touchEnabled(): boolean {
  if (isNativeApp()) return true;
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || (navigator.maxTouchPoints ?? 0) > 0;
}

/**
 * 手机端下拉刷新：在页面顶部向下拉，过阈值松手后强制云同步并刷新数据。
 * 纯 Web 触摸实现，不影响桌面端与正常滚动。
 */
export function PullToRefresh() {
  const [state, setState] = useState<PullState>({ phase: "idle", distance: 0 });

  useEffect(() => {
    if (!touchEnabled()) return;
    const controller = new PullToRefreshController({
      getScrollTop: () =>
        window.scrollY ||
        document.documentElement?.scrollTop ||
        document.body?.scrollTop ||
        0,
      onRefresh: async () => {
        await cloudStorage.forceSync().catch(() => undefined);
        // 各页面的 useLocalStorage 仅在挂载时读取，reload 确保展示最新数据
        if (cloudStorage.isEnabled() && typeof window !== "undefined") {
          try {
            window.location.reload();
          } catch {
            /* 个别 WebView / 测试环境不允许 reload，忽略 */
          }
        }
      },
      onStateChange: setState,
    });
    return controller.attach(document);
  }, []);

  if (state.phase === "idle" || state.distance <= 0) return null;

  const refreshing = state.phase === "refreshing";
  const ready = state.phase === "ready";
  const label = refreshing ? "正在刷新…" : ready ? "松开立即刷新" : "下拉刷新";
  const opacity = Math.min(1, state.distance / PULL_THRESHOLD);

  return createPortal(
    <div
      className="pull-to-refresh"
      style={{ height: state.distance, opacity }}
      aria-live="polite"
    >
      <span className={`pull-to-refresh-icon${refreshing ? " ptr-spinning" : ""}`}
        style={refreshing ? undefined : { transform: ready ? "rotate(180deg)" : "rotate(0deg)" }}>
        <ArrowClockwise size={18} weight="bold" />
      </span>
      <span className="pull-to-refresh-text">{label}</span>
    </div>,
    document.body,
  );
}
