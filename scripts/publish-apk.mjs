#!/usr/bin/env node
/**
 * 发布整包 Android APK 到 Supabase Storage（自托管，固定下载链接，便于直接分享安装）。
 *
 * 用法：
 *   node scripts/publish-apk.mjs <apkPath> <version> [--notes-file <path>]
 *
 * 上传两个对象：
 *   app-updates/android/sock-erp-latest.apk   （固定链接，始终指向最新版，方便分享）
 *   app-updates/android/sock-erp-v<ver>.apk   （带版本号的归档）
 * 然后 upsert app_data 表的 latest_app_version 行，供 APP 启动时的整包更新弹窗读取。
 *
 * 需要环境变量：SUPABASE_URL（可省略）、SUPABASE_SERVICE_ROLE_KEY。
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://naocybheyicuilbvjpbw.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const bucket = "app-updates";
const APK_MIME = "application/vnd.android.package-archive";

const args = process.argv.slice(2);
const apkPath = args.find((a) => !a.startsWith("--"));
const version = args.find((a) => /^\d+\.\d+\.\d+$/.test(a));
const notesIdx = args.indexOf("--notes-file");
const notesFile = notesIdx >= 0 ? args[notesIdx + 1] : "";

if (!SERVICE_KEY) {
  console.error("缺少 SUPABASE_SERVICE_ROLE_KEY 环境变量。");
  process.exit(1);
}
if (!apkPath || !version) {
  console.error("用法：node scripts/publish-apk.mjs <apkPath> <version> [--notes-file <path>]");
  process.exit(1);
}

const notes = notesFile ? readFileSync(notesFile, "utf8").trim() : "";
const apkBuffer = readFileSync(path.resolve(apkPath));
console.log(`APK 大小：${(apkBuffer.length / 1024 / 1024).toFixed(2)} MB`);

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

async function uploadObject(objectPath, buffer, contentType) {
  const urlPath = `/object/${bucket}/${objectPath}`;
  let res = await storageRequest("POST", urlPath, buffer, contentType);
  if (!res.ok) {
    res = await storageRequest("PUT", urlPath, buffer, contentType);
  }
  if (!res.ok) {
    const msg = typeof res.json === "object" ? res.json?.message : res.json;
    throw new Error(`上传 ${objectPath} 失败：${msg}`);
  }
  console.log(`已上传：${objectPath}`);
}

async function upsertLatestVersion(data) {
  const url = `${SUPABASE_URL}/rest/v1/app_data?on_conflict=storage_key`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ storage_key: "latest_app_version", data }),
  });
  if (!res.ok) {
    throw new Error(`写入 latest_app_version 失败：${res.status} ${await res.text()}`);
  }
  console.log("已更新 latest_app_version");
}

const publicBase = `${SUPABASE_URL}/storage/v1/object/public/${bucket}`;
const latestPath = `${"android"}/sock-erp-latest.apk`;
const versionedPath = `${"android"}/sock-erp-v${version}.apk`;
const latestUrl = `${publicBase}/${latestPath}`;

await uploadObject(versionedPath, apkBuffer, APK_MIME);
await uploadObject(latestPath, apkBuffer, APK_MIME);

const changes = notes
  .split(/\r?\n/)
  .map((l) => l.replace(/^\s*\d+[.、]\s*/, "").trim())
  .filter(Boolean);

const info = {
  version,
  apkUrl: latestUrl,
  downloadUrl: latestUrl,
  releaseDate: new Date().toISOString().slice(0, 10),
  releaseNotes: notes || `版本 ${version}`,
  changes,
};
await upsertLatestVersion(info);

console.log("\n✅ APK 发布成功");
console.log("固定下载链接（分享给手机直接安装）：");
console.log(latestUrl);
