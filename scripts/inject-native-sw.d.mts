// 类型声明：整包 APK 内置资源的 Service Worker 处理（实现见 inject-native-sw.mjs）
export interface ProcessNativeAssetsResult {
  replaced: boolean;
  removed: string[];
}

export function processNativeAssets(
  publicDir: string,
  killSwPath: string,
): ProcessNativeAssetsResult;
