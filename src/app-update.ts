import { Capacitor } from "@capacitor/core";
import { CapacitorUpdater } from "@capgo/capacitor-updater";

// 热更新资源托管在 Supabase Storage 的公开 bucket 中（无需额外服务器）
const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string) ||
  "https://naocybheyicuilbvjpbw.supabase.co";
const UPDATE_BUCKET = "app-updates";

/** 版本清单（version.json）的固定地址，Capgo 兼容的自托管清单格式 */
export const UPDATE_MANIFEST_URL = `${SUPABASE_URL}/storage/v1/object/public/${UPDATE_BUCKET}/android/version.json`;

/** 服务端版本清单的结构 */
export interface UpdateManifest {
  /** 最新 web bundle 的语义化版本，如 1.0.1 */
  version: string;
  /** bundle zip 的可下载地址 */
  url: string;
  /** Capgo 约定：success 表示有可用版本，error 表示无更新 */
  status: "success" | "error";
  /** 本次更新说明（可选） */
  notes?: string;
  /** 发布时间（可选，ISO 字符串） */
  releasedAt?: string;
  /** 要求的最低原生版本，低于此版本需重装 APK（可选） */
  minNativeVersion?: string;
}

export interface UpdateCheckResult {
  /** 是否有可下载的新版本 */
  available: boolean;
  /** 当前运行的 bundle 版本 */
  currentVersion: string;
  /** 服务端最新版本（取不到时为 null） */
  latestVersion: string | null;
  /** 原生 APK 版本 */
  nativeVersion: string | null;
  manifest: UpdateManifest | null;
  message: string;
}

/**
 * 比较两个语义化版本。
 * @returns a>b 返回 1，a<b 返回 -1，相等返回 0
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    String(v)
      .replace(/^[vV]/, "")
      .split(".")
      .map((part) => {
        const n = parseInt(part, 10);
        return Number.isFinite(n) ? n : 0;
      });
  const pa = parse(a);
  const pb = parse(b);
  const length = Math.max(pa.length, pb.length);
  for (let i = 0; i < length; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/** 是否运行在 Capacitor 原生壳（手机 APK）内 */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** 当前运行的 bundle 版本；未做过热更新时回退为原生版本 */
export async function getCurrentVersion(): Promise<{
  bundleVersion: string;
  nativeVersion: string;
}> {
  if (!isNativeApp()) return { bundleVersion: "0.0.0", nativeVersion: "0.0.0" };
  try {
    const { bundle, native } = await CapacitorUpdater.current();
    return {
      bundleVersion: bundle.version || native || "0.0.0",
      nativeVersion: native || "0.0.0",
    };
  } catch {
    return { bundleVersion: "0.0.0", nativeVersion: "0.0.0" };
  }
}

/** 拉取服务端版本清单；网络失败或格式不合法时返回 null */
export async function fetchManifest(signal?: AbortSignal): Promise<UpdateManifest | null> {
  const response = await fetch(UPDATE_MANIFEST_URL, {
    signal,
    headers: { "Cache-Control": "no-cache" },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as Partial<UpdateManifest>;
  if (!data || typeof data.version !== "string" || typeof data.url !== "string") {
    return null;
  }
  return {
    version: data.version,
    url: data.url,
    status: data.status === "error" ? "error" : "success",
    notes: typeof data.notes === "string" ? data.notes : undefined,
    releasedAt: typeof data.releasedAt === "string" ? data.releasedAt : undefined,
    minNativeVersion:
      typeof data.minNativeVersion === "string" ? data.minNativeVersion : undefined,
  };
}

/** 检查是否有新版本 */
export async function checkForUpdates(signal?: AbortSignal): Promise<UpdateCheckResult> {
  const { bundleVersion, nativeVersion } = await getCurrentVersion();

  if (!isNativeApp()) {
    return {
      available: false,
      currentVersion: bundleVersion,
      latestVersion: null,
      nativeVersion,
      manifest: null,
      message: "当前为网页/电脑端，无需应用内更新",
    };
  }

  let manifest: UpdateManifest | null = null;
  try {
    manifest = await fetchManifest(signal);
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
  }

  if (!manifest || manifest.status === "error") {
    return {
      available: false,
      currentVersion: bundleVersion,
      latestVersion: null,
      nativeVersion,
      manifest: null,
      message: "无法连接更新服务器，请稍后再试",
    };
  }

  // 原生版本过低，提示需要重装 APK（热更新只能换 web 资源）
  if (
    manifest.minNativeVersion &&
    compareVersions(nativeVersion, manifest.minNativeVersion) < 0
  ) {
    return {
      available: false,
      currentVersion: bundleVersion,
      latestVersion: manifest.version,
      nativeVersion,
      manifest,
      message: `该版本需要重新安装 APK（当前原生版本 ${nativeVersion}）`,
    };
  }

  const available = compareVersions(manifest.version, bundleVersion) > 0;
  return {
    available,
    currentVersion: bundleVersion,
    latestVersion: manifest.version,
    nativeVersion,
    manifest,
    message: available ? `发现新版本 ${manifest.version}` : "已是最新版本",
  };
}

/**
 * 下载新版本 bundle 并设为下次启动使用（不会立即中断当前操作）。
 * @returns 下载好的 bundle id
 */
export async function downloadAndInstall(
  manifest: UpdateManifest,
  onProgress?: (percent: number) => void,
): Promise<string> {
  if (!isNativeApp()) throw new Error("当前环境不支持应用内更新");

  let handle: { remove: () => void } | undefined;
  if (onProgress) {
    try {
      handle = await CapacitorUpdater.addListener("download", (state: { percent: number }) => {
        if (typeof state.percent === "number") onProgress(state.percent);
      });
    } catch {
      /* 进度监听不可用时不阻塞下载 */
    }
  }

  try {
    const bundle = await CapacitorUpdater.download({
      url: manifest.url,
      version: manifest.version,
    });
    // next() 标记下次启动加载该 bundle，比 set() 立即重启更安全
    await CapacitorUpdater.next({ id: bundle.id });
    return bundle.id;
  } finally {
    handle?.remove();
  }
}

/** 立即重启并切换到已下载的新版本 */
export async function restartWithBundle(bundleId: string): Promise<void> {
  if (!isNativeApp()) return;
  await CapacitorUpdater.set({ id: bundleId });
}

/**
 * 应用启动后必须通知插件当前 bundle 运行正常，
 * 否则插件会在 appReadyTimeout 后判定更新失败并自动回滚。
 */
export async function notifyAppReady(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await CapacitorUpdater.notifyAppReady();
  } catch {
    /* 非更新场景下插件可能返回错误，忽略即可 */
  }
}
