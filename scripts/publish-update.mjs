#!/usr/bin/env node
/**
 * 发布前端热更新 bundle 到 Supabase Storage（自托管，无需 Capgo 云账号）。
 *
 * 用法：
 *   node scripts/publish-update.mjs [版本号] [--notes "更新说明"] [--skip-build]
 *   node scripts/publish-update.mjs --patch --notes "修复原材料添加"
 *
 * 需要的环境变量（在 Supabase 控制台 → Project Settings → API 获取）：
 *   SUPABASE_URL              （可省略，默认用项目内置地址）
 *   SUPABASE_SERVICE_ROLE_KEY  service_role 密钥（仅用于上传，不会打进 APP）
 *
 * 产物：
 *   app-updates/android/bundles/<version>.zip
 *   app-updates/android/version.json   （Capgo 兼容的版本清单）
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(projectRoot, "dist");
const bucket = "app-updates";
const platform = "android";

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://naocybheyicuilbvjpbw.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const args = process.argv.slice(2);
const notes = (() => {
  // 最可靠：从 UTF-8 文件读取中文更新说明（彻底绕过 PowerShell/命令行编码问题）
  if (process.env.PUBLISH_NOTES_FILE) {
    try {
      return readFileSync(process.env.PUBLISH_NOTES_FILE, "utf8").trim();
    } catch (error) {
      console.warn(`无法读取 PUBLISH_NOTES_FILE：${error.message}`);
    }
  }
  // 其次用环境变量（部分终端中文仍可能乱码）
  if (process.env.PUBLISH_NOTES) return process.env.PUBLISH_NOTES;
  const i = args.indexOf("--notes");
  return i >= 0 ? args[i + 1] : "";
})();
const skipBuild = args.includes("--skip-build");
const bumpPatch = args.includes("--patch");
const versionArg = args.find((a) => /^\d+\.\d+\.\d+$/.test(a));

function bumpPatchVersion(v) {
  const [maj, min, patch] = v.split(".").map((n) => parseInt(n, 10) || 0);
  return `${maj}.${min}.${patch + 1}`;
}

function readPackageVersion() {
  const pkg = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  return pkg.version || "0.1.0";
}

async function addDirToZip(zip, dir, zipPrefix = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const zipPath = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await addDirToZip(zip, full, zipPath);
    } else {
      zip.file(zipPath, readFileSync(full));
    }
  }
}

async function storageRequest(method, urlPath, body, contentType) {
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
  };
  if (contentType) headers["Content-Type"] = contentType;
  const res = await fetch(`${SUPABASE_URL}/storage/v1${urlPath}`, {
    method,
    headers,
    body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { ok: res.ok, status: res.status, json };
}

async function ensureBucket() {
  // 已存在则返回 200/400006，不影响上传
  const created = await storageRequest(
    "POST",
    "/bucket",
    JSON.stringify({ id: bucket, name: bucket, public: true, file_size_limit: 104857600 }),
    "application/json",
  );
  if (!created.ok) {
    const msg = typeof created.json === "object" ? created.json?.message : created.json;
    // 已存在的 bucket 会报错，这里尝试查询确认
    const got = await storageRequest("GET", `/bucket/${bucket}`);
    if (!got.ok) {
      throw new Error(`无法创建或访问 bucket「${bucket}」：${msg}`);
    }
  }
}

async function uploadFile(objectPath, buffer, contentType) {
  const urlPath = `/object/${bucket}/${objectPath}`;
  let res = await storageRequest("POST", urlPath, buffer, contentType);
  if (!res.ok) {
    // 已存在则改为 PUT 覆盖
    res = await storageRequest("PUT", urlPath, buffer, contentType);
  }
  if (!res.ok) {
    const msg = typeof res.json === "object" ? res.json?.message : res.json;
    throw new Error(`上传 ${objectPath} 失败：${msg}`);
  }
}

async function main() {
  if (!SERVICE_KEY) {
    console.error("缺少 SUPABASE_SERVICE_ROLE_KEY 环境变量。");
    console.error("请在 Supabase 控制台 → Project Settings → API 复制 service_role 密钥，然后：");
    console.error("  export SUPABASE_SERVICE_ROLE_KEY='你的密钥'   (Linux/macOS)");
    console.error("  set SUPABASE_SERVICE_ROLE_KEY=你的密钥        (Windows CMD)");
    process.exit(1);
  }

  let version = versionArg || readPackageVersion();
  if (bumpPatch && !versionArg) version = bumpPatchVersion(version);
  console.log(`发布版本：${version}`);

  if (!skipBuild) {
    console.log("构建前端（vite build）…");
    execSync("npx vite build", { cwd: projectRoot, stdio: "inherit" });
  }
  if (!existsSync(path.join(distDir, "index.html"))) {
    throw new Error("dist/index.html 不存在，请先构建前端");
  }

  console.log("打包 dist 为 zip…");
  const zip = new JSZip();
  await addDirToZip(zip, distDir);
  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
  console.log(`zip 大小：${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  console.log("确保 bucket 存在…");
  await ensureBucket();

  const bundlePath = `${platform}/bundles/${version}.zip`;
  const publicBase = `${SUPABASE_URL}/storage/v1/object/public/${bucket}`;
  const bundleUrl = `${publicBase}/${bundlePath}`;

  console.log(`上传 bundle：${bundlePath}`);
  await uploadFile(bundlePath, zipBuffer, "application/zip");

  const manifest = {
    version,
    url: bundleUrl,
    status: "success",
    notes: notes || `版本 ${version}`,
    releasedAt: new Date().toISOString(),
  };
  console.log("上传版本清单 version.json…");
  await uploadFile(
    `${platform}/version.json`,
    Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
    "application/json",
  );

  console.log("\n✅ 发布成功");
  console.log(`版本清单：${publicBase}/${platform}/version.json`);
  console.log(`Bundle：${bundleUrl}`);
  console.log("手机 APP 打开「数据与设置 → 应用更新 → 检查更新」即可获取。");
}

main().catch((error) => {
  console.error("发布失败：", error.message);
  process.exit(1);
});
