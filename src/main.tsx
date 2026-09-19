import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { WorkspaceProvider } from "./WorkspaceContext";
import { cloudStorage } from "./sync";
import { notifyAppReady } from "./app-update";
import { cleanupServiceWorkerInNative } from "./native-sw-cleanup";
import "./styles.css";
import "./themes/notebook.css";
import "./neo.css";

// 原生手机 APP 启动时先注销旧版本残留的 Service Worker，避免它拦截热更新 bundle。
// 必须在任何渲染与网络请求之前执行。
cleanupServiceWorkerInNative();

// ===== 全局 patch localStorage，使所有页面自动云同步 =====
const originalSetItem = localStorage.setItem.bind(localStorage);
const originalRemoveItem = localStorage.removeItem.bind(localStorage);

localStorage.setItem = function (key: string, value: string): void {
  originalSetItem(key, value);
  // 通过 cloudStorage 同步到云端（内部使用原始localStorage，不会递归）
  if (key.startsWith("sock-erp-") && key !== "sock-erp-device-id") {
    cloudStorage.setItem(key, value);
  }
};

localStorage.removeItem = function (key: string): void {
  originalRemoveItem(key);
  if (key.startsWith("sock-erp-") && key !== "sock-erp-device-id") {
    cloudStorage.removeItem(key);
  }
};

// 初始化云同步（从云端拉取 + 订阅实时变更）
void cloudStorage.init().then(({ merged }) => {
  if (merged > 0) {
    console.log(`[CloudSync] 从云端合并了 ${merged} 条数据`);
  }
});

// 通知热更新插件当前 bundle 已正常启动（否则会被判定失败并回滚）
void notifyAppReady();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <WorkspaceProvider><App /></WorkspaceProvider>
    </QueryClientProvider>
  </StrictMode>,
);
