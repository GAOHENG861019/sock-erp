// electron-builder afterPack 钩子：
// extraResources 默认会忽略 node_modules，这里在打包后把后端生产依赖
// （含 better-sqlite3 的原生 .node 二进制）原样复制到 resources/app-server。
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  const projectRoot = path.resolve(__dirname, "..");
  const srcNodeModules = path.join(projectRoot, "release-staging", "app-server", "node_modules");
  const destNodeModules = path.join(context.appOutDir, "resources", "app-server", "node_modules");

  if (!fs.existsSync(srcNodeModules)) {
    throw new Error(`找不到生产依赖目录：${srcNodeModules}`);
  }

  console.log(`[after-pack] 复制后端依赖到 app-server/node_modules …`);
  fs.rmSync(destNodeModules, { recursive: true, force: true });
  fs.cpSync(srcNodeModules, destNodeModules, {
    recursive: true,
    // 跳过开发期无关文件，减小体积
    filter: (src) => {
      if (src.endsWith(".ts") || src.endsWith(".map")) return false;
      if (src.includes(`${path.sep}test${path.sep}`) || src.includes(`${path.sep}tests${path.sep}`)) return false;
      if (src.includes(`${path.sep}.github${path.sep}`) || src.includes(`${path.sep}docs${path.sep}`)) return false;
      return true;
    },
  });

  // 校验原生二进制
  const nativeBinary = path.join(
    destNodeModules,
    "better-sqlite3",
    "build",
    "Release",
    "better_sqlite3.node",
  );
  if (!fs.existsSync(nativeBinary)) {
    throw new Error("打包后缺少 better-sqlite3 原生二进制 better_sqlite3.node");
  }
  console.log("[after-pack] 完成，better-sqlite3 原生二进制已就位。");
};
