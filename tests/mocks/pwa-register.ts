// Mock for virtual:pwa-register/react in test environment
import { useState } from "react";

export function useRegisterSW(_options?: Record<string, unknown>) {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  return {
    offlineReady: [offlineReady, setOfflineReady] as const,
    needRefresh: [needRefresh, setNeedRefresh] as const,
    updateServiceWorker: async (_reload?: boolean) => {},
    cancel: () => {},
  };
}
