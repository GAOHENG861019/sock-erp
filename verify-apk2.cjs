const fs = require("fs");
const JSZip = require("jszip");

async function main() {
  const zip = await JSZip.loadAsync(fs.readFileSync("android/app/build/outputs/apk/debug/app-debug.apk"));
  const mainJs = await zip.file("assets/public/assets/index-DjPUIWOk.js")?.async("string");
  console.log("主 JS 字节数:", mainJs ? mainJs.length : "缺失");
  if (!mainJs) return;
  const checks = {
    "注销SW(getRegistrations+unregister)": mainJs.includes("getRegistrations") && mainJs.includes("unregister"),
    "下拉刷新(pull-to-refresh)": mainJs.includes("pull-to-refresh") || mainJs.includes("PullToRefresh"),
    "条目级合并(sock-erp-sync-entries)": mainJs.includes("sock-erp-sync-entries"),
    "原材料添加(保存并继续)": mainJs.includes("保存并继续"),
    "返回键(exitApp)": mainJs.includes("exitApp"),
    "版本 1.4.0": mainJs.includes("1.4.0"),
  };
  for (const [k, v] of Object.entries(checks)) console.log(k, "=>", v);

  // 单独确认 FitnessPage chunk
  const fitness = await zip.file("assets/public/assets/FitnessPage-B4y6emMY.js")?.async("string");
  console.log("\nFitnessPage 字节数:", fitness ? fitness.length : "缺失");
  if (fitness) {
    console.log("含'添加原材料':", fitness.includes("添加原材料"));
    console.log("含'保存并继续':", fitness.includes("保存并继续"));
    console.log("含'原材料种类':", fitness.includes("原材料种类"));
    console.log("含 cloudStorage:", fitness.includes("cloudStorage") || fitness.includes("sync-merge"));
  }
}
main().catch(e => { console.error(e); process.exit(1); });
