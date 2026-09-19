import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { isNativeApp } from "../plugins/AppUpdate";

// 离线就绪提示自动停留时长（毫秒），到点自动消失，避免长期遮挡弹窗底部按钮
const OFFLINE_HINT_MS = 3000;

/**
 * 浏览器环境的 Service Worker 横幅。
 *
 * 关键：useRegisterSW 这个 Hook 一旦被调用就会注册 Service Worker。
 * Capacitor 原生手机 APP 绝不能注册 SW —— workbox 的 navigateFallback 会把
 * index.html 缓存住，Capgo 热更新切换到新 bundle 后，旧 SW 仍拦截导航返回旧资源，
 * 导致热更新永远不生效。因此本组件只在浏览器环境挂载，原生环境在外层直接 return null，
 * 连 Hook 都不会执行。
 */
function BrowserSWBanner() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);

  const {
    offlineReady: [offline, setOfflineReadyState],
    needRefresh: [refresh, setNeedRefreshState],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      // 每小时检查一次更新
      if (registration) {
        setInterval(() => registration.update(), 60 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error("SW注册失败:", error);
    },
  });

  useEffect(() => {
    if (offline) setOfflineReady(true);
  }, [offline]);

  useEffect(() => {
    if (refresh) setNeedRefresh(true);
  }, [refresh]);

  // 离线就绪只是一次性提示，3 秒后自动收起，避免遮挡弹窗底部的保存按钮
  useEffect(() => {
    if (!offlineReady) return;
    const timer = window.setTimeout(() => setOfflineReady(false), OFFLINE_HINT_MS);
    return () => window.clearTimeout(timer);
  }, [offlineReady]);

  if (!needRefresh && !offlineReady) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        background: needRefresh ? "#e74c3c" : "#27ae60",
        color: "#fff",
        padding: "10px 20px",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: 14,
        maxWidth: "90vw",
      }}
    >
      <span>{needRefresh ? "发现新版本，点击更新" : "应用已可离线使用"}</span>
      {needRefresh && (
        <button
          onClick={() => updateServiceWorker(true)}
          style={{
            background: "#fff",
            color: "#e74c3c",
            border: "none",
            padding: "4px 12px",
            borderRadius: 4,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          更新
        </button>
      )}
      <button
        onClick={() => {
          setNeedRefresh(false);
          setOfflineReady(false);
          setNeedRefreshState(false);
          setOfflineReadyState(false);
        }}
        style={{
          background: "transparent",
          color: "#fff",
          border: "none",
          cursor: "pointer",
          fontSize: 16,
          opacity: 0.8,
        }}
      >
        ×
      </button>
    </div>
  );
}

export function PWAUpdateBanner() {
  // 原生手机 APP（Capacitor）资源已内置在本地、天然离线，更新由 Capgo 热更新负责。
  // 这里提前返回，不挂载 BrowserSWBanner，从而保证 useRegisterSW 完全不执行、不注册 SW。
  if (isNativeApp()) return null;
  return <BrowserSWBanner />;
}
