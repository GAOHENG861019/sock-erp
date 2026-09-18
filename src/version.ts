// 前端构建版本号，来源于 package.json。
// 用 JSON import 而非 vite define，保证在生产构建、单元测试和电脑端都能取到一致的值。
import pkg from "../package.json";

export const APP_VERSION = pkg.version;
