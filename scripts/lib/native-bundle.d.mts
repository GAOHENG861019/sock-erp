// 类型声明：原生热更新 bundle 的 Service Worker 处理（实现见 native-bundle.mjs）
export interface ApplyNativeServiceWorkerResult {
  /** 是否用自毁 SW 成功覆盖了 bundle 内 sw.js */
  replaced: boolean;
  /** 被移除的 workbox 运行库文件名列表 */
  removed: string[];
  /** 是否找到自毁 SW 源文件 */
  killSwFound: boolean;
}

export interface MinimalZip {
  file(name: string, data: string | Uint8Array | ArrayBuffer): void;
  files: Record<string, unknown>;
  remove(name: string): void;
}

export function applyNativeServiceWorker(
  zip: MinimalZip,
  projectRoot: string,
): ApplyNativeServiceWorkerResult;
