import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

export function PWAUpdateBanner() {
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
