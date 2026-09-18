import type { CapacitorConfig } from "@capacitor/cli";

// 热更新清单托管在 Supabase Storage 公开 bucket（无需自建服务器）
const updateManifestUrl =
  "https://naocybheyicuilbvjpbw.supabase.co/storage/v1/object/public/app-updates/android/version.json";

const config: CapacitorConfig = {
  appId: "com.sock.erp",
  appName: "袜厂ERP",
  webDir: "dist",
  bundledWebRuntime: false,
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: "https",
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#1a1a2e",
      showSpinner: false,
    },
    CapacitorUpdater: {
      // 采用手动更新（设置页“检查更新”），避免后台静默切换
      autoUpdate: "off",
      updateUrl: updateManifestUrl,
      // 新版本启动后 15 秒内必须 notifyAppReady，否则自动回滚
      appReadyTimeout: 15000,
      responseTimeout: 60,
      autoDeleteFailed: true,
      autoDeletePrevious: true,
      resetWhenUpdate: true,
      // 关闭向 Capgo 官方上报统计，数据只走自己的 Supabase
      statsUrl: "",
      allowModifyUrl: true,
    },
  },
};

export default config;
