/**
 * 通过 GitHub Git Data API 推送本地提交（用于 github.com 直连不通、但 api.github.com 可达的环境）。
 *
 * 用法：
 *   $env:GITHUB_TOKEN="ghp_xxx"; node scripts/push-api.mjs
 *   node scripts/push-api.mjs --dry-run        # 只打印差异，不推送
 *
 * 安全：token 只从环境变量 GITHUB_TOKEN 读取，绝不硬编码；
 *      脚本不会、也无法（缺 workflow scope）修改 .github/workflows/ 下的文件，会自动跳过并提示。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OWNER = "GAOHENG861019";
const REPO = "sock-erp";
const BRANCH = "master";
const dryRun = process.argv.includes("--dry-run");

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("缺少 GITHUB_TOKEN 环境变量。");
  process.exit(1);
}

const api = `https://api.github.com/repos/${OWNER}/${REPO}`;
const headers = {
  Authorization: `token ${token}`,
  "User-Agent": "sock-erp-push",
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

function git(...args) {
  return execFileSync("git", args, { cwd: projectRoot, encoding: "utf8" }).trim();
}

// 用 `git ls-files -s -z` 取仓库内已暂存的 blob SHA（与行尾 CRLF/LF 无关），
// 按 Buffer 切分，避免中文路径在 Windows 命令行参数下的编码问题。
function gitStagedFiles() {
  const buf = execFileSync("git", ["-c", "core.quotepath=false", "ls-files", "-s", "-z"], {
    cwd: projectRoot,
    encoding: "buffer",
  });
  const map = new Map();
  for (const record of buf.toString("utf8").split("\u0000")) {
    if (!record) continue;
    // 格式：<mode> SP <sha> SP <stage> TAB <path>
    const tab = record.indexOf("\t");
    const meta = record.slice(0, tab).split(" ");
    const sha = meta[1];
    const file = record.slice(tab + 1);
    if (sha && file) map.set(file, sha);
  }
  return map;
}

async function ghJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} ${options.method || "GET"} ${url}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  // 1. 远程分支当前 commit 与递归 tree
  const ref = await ghJson(`${api}/commits/heads/${BRANCH}`);
  const parentSha = ref.sha;
  const baseTreeSha = ref.commit.tree.sha;
  console.log(`远程 ${BRANCH}: ${parentSha} (tree ${baseTreeSha})`);

  const remoteTree = await ghJson(`${api}/git/trees/${baseTreeSha}?recursive=1`);
  if (remoteTree.truncated) {
    console.warn("警告：远程 tree 被截断，差异可能不完整。");
  }
  const remoteFiles = new Map();
  for (const entry of remoteTree.tree || []) {
    if (entry.type === "blob") remoteFiles.set(entry.path, entry.sha);
  }

  // 2. 本地跟踪文件及其仓库内 blob SHA
  const localFiles = gitStagedFiles();

  // 3. 计算差异
  const toAddOrUpdate = [];
  for (const [file, sha] of localFiles) {
    if (remoteFiles.get(file) !== sha) toAddOrUpdate.push(file);
  }
  const toDelete = [];
  for (const file of remoteFiles.keys()) {
    if (!localFiles.has(file)) toDelete.push(file);
  }

  // workflows 需要单独权限，自动跳过
  const workflowChanges = [...toAddOrUpdate, ...toDelete].filter((f) =>
    f.startsWith(".github/workflows/"),
  );
  const addUpdate = toAddOrUpdate.filter((f) => !f.startsWith(".github/workflows/"));
  const deletions = toDelete.filter((f) => !f.startsWith(".github/workflows/"));

  console.log(`新增/更新：${addUpdate.length}，删除：${deletions.length}`);
  if (workflowChanges.length) {
    console.warn(`跳过 .github/workflows/（token 缺 workflow scope）：${workflowChanges.join(", ")}`);
  }
  if (addUpdate.length) console.log("新增/更新文件：\n  " + addUpdate.join("\n  "));
  if (deletions.length) console.log("删除文件：\n  " + deletions.join("\n  "));

  if (!addUpdate.length && !deletions.length) {
    console.log("本地与远程一致，无需推送。");
    return;
  }
  if (dryRun) {
    console.log("dry-run：未推送。");
    return;
  }

  // 4. 为每个新增/更新文件创建 blob（读取仓库内版本，保证行尾与 SHA 一致）
  const treeEntries = [];
  for (const file of addUpdate) {
    const localSha = localFiles.get(file);
    const content = execFileSync("git", ["cat-file", "blob", localSha], {
      cwd: projectRoot,
      encoding: "buffer",
    });
    const blob = await ghJson(`${api}/git/blobs`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.toString("base64"), encoding: "base64" }),
    });
    if (blob.sha !== localSha) {
      console.warn(`警告：${file} 上传后 SHA 不一致（本地 ${localSha} / 远程 ${blob.sha}）`);
    }
    treeEntries.push({ path: file, mode: "100644", type: "blob", sha: blob.sha });
  }
  for (const file of deletions) {
    treeEntries.push({ path: file, mode: "100644", type: "blob", sha: null });
  }

  // 5. 创建 tree（基于远程 tree）
  const newTree = await ghJson(`${api}/git/trees`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
  });
  console.log(`新 tree：${newTree.sha}`);

  // 6. 创建 commit
  const message = process.env.PUSH_MESSAGE || `chore: 同步本地更新（${addUpdate.length} 个文件）`;
  const commit = await ghJson(`${api}/git/commits`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ message, tree: newTree.sha, parents: [parentSha] }),
  });
  console.log(`新 commit：${commit.sha}`);

  // 7. 更新分支引用
  const updated = await ghJson(`${api}/git/refs/heads/${BRANCH}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  console.log(`已更新 ${BRANCH} -> ${updated.object.sha}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
