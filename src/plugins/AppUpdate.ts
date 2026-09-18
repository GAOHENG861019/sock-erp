import { registerPlugin } from "@capacitor/core";

export interface AppUpdatePlugin {
  downloadAndInstall(options: { url: string }): Promise<{ downloadId: number }>;
}

export const AppUpdate = registerPlugin<AppUpdatePlugin>("AppUpdate", {
  web: {
    async downloadAndInstall(options: { url: string }) {
      // Web端：打开浏览器下载
      window.open(options.url, "_system");
      return { downloadId: 0 };
    },
  },
});

export function isNativeApp() {
  return typeof (window as any).Capacitor !== "undefined" && (window as any).Capacitor.isNativePlatform?.();
}
