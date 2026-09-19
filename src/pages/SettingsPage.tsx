import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, DownloadSimple, ArrowCounterClockwise, Trash, Sun, Moon, Check, Archive, Notebook, Stack, SquaresFour, Cloud, MagnifyingGlass, ArrowClockwise, ShareNetwork, FileJs, WhatsappLogo } from "@phosphor-icons/react";
import { api } from "../api";
import { useWorkspace } from "../WorkspaceContext";
import type { CollectionName } from "../types";
import { formatBytes, formatDateTime } from "../utils";
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, PageHeader, Section, Skeleton } from "../components/ui";
import { ModuleArtwork } from "../components/ModuleArtwork";
import { AppUpdateSection } from "../components/AppUpdateSection";
import { normalizeAppearance } from "../appearance";
import { isNativeApp } from "../plugins/AppUpdate";
import * as XLSX from "xlsx";

const collectionLabels: Record<string, string> = { planItems: "本月总览", quickMemos: "快速备忘", mediaContents: "工作进度", devProjects: "商品项目", devMilestones: "商品分类", devWorkItems: "商品明细", devLogs: "操作日志", clients: "客户", consultingProjects: "仓库项目", consultingInteractions: "出入库记录", consultingDeliverables: "出库单", consultingFollowups: "库存跟进", consultingTimeEntries: "盘点时长", workoutTemplates: "采购模板", workoutTemplateExercises: "模板物料", workouts: "采购记录", workoutExercises: "采购明细", workoutSets: "采购批次", bodyMetrics: "供应商数据", nutritionTargets: "库存目标", foods: "常用物料", meals: "盘点单", mealItems: "盘点明细", entertainmentItems: "采购单", playSessions: "采购执行记录" };
const dashboardOptions = [{ value: "development", label: "商品管理" }, { value: "consulting", label: "仓库管理" }, { value: "customer", label: "客户中心" }, { value: "fitness", label: "原材料采购" }, { value: "diet", label: "库存盘点" }, { value: "entertainment", label: "机器损耗" }];

export function SettingsPage() {
  const { data, run } = useWorkspace();
  const system = useQuery({ queryKey: ["system"], queryFn: async () => { try { return (await api.systemStatus()) ?? null; } catch { return null; } } });
  const backups = useQuery({ queryKey: ["backups"], queryFn: async () => { try { return (await api.backups()) ?? null; } catch { return null; } } });
  const baiduConfig = useQuery({ queryKey: ["baidu-backup-config"], queryFn: async () => { try { return (await api.baiduBackupConfig()) ?? null; } catch { return null; } } });
  const [baiduPath, setBaiduPath] = useState("");
  const [baiduSyncing, setBaiduSyncing] = useState(false);
  const [baiduMsg, setBaiduMsg] = useState("");
  const [appVersion] = useState("1.4.0");
  const [busy, setBusy] = useState("");
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [permanent, setPermanent] = useState<{ collection: CollectionName; id: string; title: string } | null>(null);
  const [dashboardModules, setDashboardModules] = useState<string[] | null>(null);
  const [exportModules, setExportModules] = useState<string[]>(["all"]);
  const exportableModules = [
    { key: "fanwa", label: "翻袜记录", storageKey: "sock-erp-fanwa" },
    { key: "fengtou", label: "缝头记录", storageKey: "sock-erp-fengtou" },
    { key: "dingxing", label: "定型记录", storageKey: "sock-erp-dingxing" },
    { key: "finishedInventory", label: "成品库存", storageKey: "sock-erp-finished-inventory" },
    { key: "materialInventory", label: "原材料库存", storageKey: "sock-erp-material-inventory" },
    { key: "rawMaterials", label: "原材料采购", storageKey: "sock-erp-raw-materials" },
    { key: "products", label: "商品管理", storageKey: "sock-erp-products" },
    { key: "productCategories", label: "商品分类", storageKey: "sock-erp-product-categories" },
    { key: "materialCategories", label: "原材料分类", storageKey: "sock-erp-material-categories" },
    { key: "customers", label: "客户中心", storageKey: "sock-erp-customers" },
    { key: "salary", label: "工资支出", storageKey: "sock-erp-salary" },
    { key: "machineLoss", label: "机器损耗", storageKey: "sock-erp-machine-loss" },
    { key: "freight", label: "运货运费", storageKey: "sock-erp-freight" },
    { key: "paymentIncome", label: "货款收入", storageKey: "sock-erp-payment-income" },
    { key: "quickCreate", label: "快速新增", storageKey: "sock-erp-quick-create" },
    { key: "visibleMenu", label: "菜单设置", storageKey: "sock-erp-visible-menu" },
  ];
  const saveSetting = (key: string, value: any) => run(() => api.saveSettings({ [key]: value }));
  useEffect(() => { setDashboardModules(null); }, [data.settings.dashboardModules]);
  const createBackup = async () => { setBusy("backup"); try { await run(() => api.createBackup("手动备份", false)); } finally { setBusy(""); } };
  useEffect(() => { if (baiduConfig.data) setBaiduPath(baiduConfig.data.netdiskPath); }, [baiduConfig.data?.netdiskPath]);

  const detectBaidu = async () => {
    try {
      const result = await api.detectBaiduNetdisk();
      if (result.detected) {
        setBaiduPath(result.detected);
        setBaiduMsg("已自动检测到百度网盘目录");
      } else {
        setBaiduMsg("未检测到百度网盘目录，请手动填写路径");
      }
    } catch { setBaiduMsg("检测失败，请手动填写路径"); }
  };

  const saveBaiduConfig = async (updates: { enabled?: boolean; netdiskPath?: string }) => {
    try {
      await api.updateBaiduBackupConfig(updates);
      await baiduConfig.refetch();
      setBaiduMsg("设置已保存");
    } catch { setBaiduMsg("保存失败"); }
  };

  const syncBaidu = async () => {
    setBaiduSyncing(true);
    setBaiduMsg("");
    try {
      // 收集所有 sock-erp 前缀的 localStorage 数据
      const lsData: Record<string, unknown> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("sock-erp-")) {
          lsData[key] = localStorage.getItem(key);
        }
      }
      const result = await api.syncBaiduBackup(lsData);
      setBaiduMsg(result.message);
      await baiduConfig.refetch();
    } catch (e) {
      setBaiduMsg(`同步失败：${(e as Error).message}`);
    } finally {
      setBaiduSyncing(false);
    }
  };


  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const shareApp = async () => {
    const shareData = {
      title: "袜厂进销存ERP管理系统",
      text: "袜厂进销存ERP管理系统 - 专业的袜厂生产管理工具，支持翻袜、缝头、定型、仓库、采购、工资等全流程管理，手机电脑数据同步。",
      url: "https://github.com/GAOHENG861019/sock-erp",
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(`${shareData.title}\n${shareData.text}\n${shareData.url}`);
        alert("APP分享信息已复制到剪贴板");
      }
    } catch { /* 用户取消 */ }
  };

  const exportDataFile = () => {
    try {
      console.log("[导出] 开始导出...");
      const selectedMods = exportModules.includes("all")
        ? exportableModules
        : exportableModules.filter(m => exportModules.includes(m.key));
      console.log("[导出] 选中模块数:", selectedMods.length);
      const wb = XLSX.utils.book_new();
      // 所有数据放在一个sheet里
      const allRows: any[][] = [];
      // 导出信息
      allRows.push(["袜厂进销存ERP管理系统 - 数据导出"]);
      allRows.push(["导出时间", new Date().toLocaleString("zh-CN")]);
      allRows.push(["版本", appVersion]);
      allRows.push(["导出模块", selectedMods.map(m => m.label).join("、")]);
      allRows.push([]);
      // 每个模块的数据
      for (const mod of selectedMods) {
        const value = localStorage.getItem(mod.storageKey);
        allRows.push(["【" + mod.label + "】"]);
        if (value === null) {
          allRows.push(["（无数据）"]);
          allRows.push([]);
          continue;
        }
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) {
            if (parsed.length === 0) {
              allRows.push(["（无数据）"]);
            } else {
              const headers = Array.from(new Set(parsed.flatMap(item => Object.keys(item))));
              allRows.push(headers);
              for (const item of parsed) {
                allRows.push(headers.map(h => {
                  const v = item[h];
                  if (v === null || v === undefined) return "";
                  if (typeof v === "object") return JSON.stringify(v);
                  return v;
                }));
              }
            }
          } else if (typeof parsed === "object" && parsed !== null) {
            const entries = Object.entries(parsed).filter(([k]) => k !== "_cloud_updated_at");
            if (entries.length === 0) {
              allRows.push(["（无数据）"]);
            } else {
              const allObjects = entries.every(([, v]) => typeof v === "object" && v !== null);
              if (allObjects) {
                const headers = Array.from(new Set(entries.flatMap(([, v]) => Object.keys(v as Record<string, any>))));
                allRows.push(["键", ...headers]);
                for (const [key, v] of entries) {
                  const obj = v as Record<string, any>;
                  allRows.push([key, ...headers.map(h => {
                    const val = obj[h];
                    if (val === null || val === undefined) return "";
                    if (typeof val === "object") return JSON.stringify(val);
                    return val;
                  })]);
                }
              } else {
                allRows.push(["字段", "值"]);
                for (const [k, v] of entries) {
                  allRows.push([k, typeof v === "object" ? JSON.stringify(v) : String(v)]);
                }
              }
            }
          } else {
            allRows.push(["值", String(parsed)]);
          }
        } catch {
          allRows.push(["原始数据", value]);
        }
        allRows.push([]);
      }
      const ws = XLSX.utils.aoa_to_sheet(allRows);
      XLSX.utils.book_append_sheet(wb, ws, "数据导出");
      // 使用write生成数组，再用Blob下载（更兼容）
      console.log("[导出] 生成Excel文件...");
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `袜厂ERP数据导出_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log("[导出] 完成! 文件大小:", blob.size, "bytes");
      alert("导出成功！已导出 " + selectedMods.length + " 个模块，文件大小: " + (blob.size / 1024).toFixed(1) + " KB，请查看浏览器下载目录");
    } catch (err) {
      console.error("[导出] 失败:", err);
      alert("导出失败: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const toggleExportModule = (key: string) => {
    if (key === "all") {
      setExportModules(["all"]);
    } else {
      setExportModules(prev => {
        const next = prev.filter(k => k !== "all");
        return next.includes(key) ? next.filter(k => k !== key) : [...next, key];
      });
    }
  };

  const shareDataToWechat = async () => {
    // 收集数据摘要
    const summary: string[] = [];
    const fanwa = JSON.parse(localStorage.getItem("sock-erp-fanwa") || "[]");
    const fengtou = JSON.parse(localStorage.getItem("sock-erp-fengtou") || "[]");
    const dingxing = JSON.parse(localStorage.getItem("sock-erp-dingxing") || "[]");
    const rawMaterials = JSON.parse(localStorage.getItem("sock-erp-raw-materials") || "[]");
    const products = JSON.parse(localStorage.getItem("sock-erp-products") || "[]");
    const customers = JSON.parse(localStorage.getItem("sock-erp-customers") || "[]");

    summary.push("📊 袜厂进销存ERP数据摘要");
    summary.push(`📅 导出时间：${new Date().toLocaleString("zh-CN")}`);
    summary.push("");
    summary.push(`👟 翻袜记录：${Array.isArray(fanwa) ? fanwa.length : 0} 条`);
    summary.push(`🧵 缝头记录：${Array.isArray(fengtou) ? fengtou.length : 0} 条`);
    summary.push(`📦 定型记录：${Array.isArray(dingxing) ? dingxing.length : 0} 条`);
    summary.push(`🛒 商品数量：${Array.isArray(products) ? products.length : 0} 个`);
    summary.push(`🏭 原材料：${Array.isArray(rawMaterials) ? rawMaterials.length : 0} 项`);
    summary.push(`👥 客户数量：${Array.isArray(customers) ? customers.length : 0} 个`);
    summary.push("");
    summary.push("💡 完整数据请在APP内「导出数据文件」获取");

    const text = summary.join("\n");

    if (navigator.share) {
      try {
        await navigator.share({
          title: "袜厂ERP数据摘要",
          text: text,
        });
      } catch { /* 用户取消 */ }
    } else {
      // 电脑端：复制到剪贴板
      try {
        await navigator.clipboard.writeText(text);
        alert("数据摘要已复制到剪贴板，可粘贴到微信发送");
      } catch {
        exportDataFile();
      }
    }
  };

  if (system.isLoading || backups.isLoading) return <><PageHeader icon={<ModuleArtwork module="settings" />} eyebrow="系统" title="数据与设置" description="检查本地数据和备份状态" /><Skeleton lines={8} /></>;
  if (system.error || backups.error) return <ErrorState message={((system.error || backups.error) as Error).message} onRetry={() => { void system.refetch(); void backups.refetch(); }} />;
  const selectedBackup = backups.data?.find((backup) => backup.id === restoreId);
  const selectedDeleteBackup = backups.data?.find((backup) => backup.id === deleteId);
  const appearance = normalizeAppearance(data.settings.appearance);
  const persistedModules = Array.isArray(data.settings.dashboardModules) ? data.settings.dashboardModules : dashboardOptions.map((option) => option.value);
  const visibleModules = dashboardModules ?? persistedModules;
  const toggleDashboardModule = (module: string, checked: boolean) => {
    const next = checked ? Array.from(new Set([...visibleModules, module])) : visibleModules.filter((value: string) => value !== module);
    setDashboardModules(next);
    void saveSetting("dashboardModules", next).catch(() => setDashboardModules(null));
  };
  return (
    <div>
      <PageHeader icon={<ModuleArtwork module="settings" />} eyebrow="本机数据控制" title="数据与设置" description="创建备份、恢复历史版本并调整使用偏好。" />
      <div className="settings-grid">
        <Section title="备份与恢复" description="每天自动备份一次，普通自动备份保留最近30份" action={<Button loading={busy === "backup"} onClick={() => void createBackup()}><ShieldCheck size={16} />立即备份</Button>}>
          {backups.data?.length ? <div className="backup-list">{backups.data.map((backup) => <article key={backup.id}><div className="backup-type"><Archive size={18} /><Badge tone={backup.type === "safety" ? "warning" : backup.type === "automatic" ? "neutral" : "accent"}>{backup.type === "automatic" ? "自动" : backup.type === "safety" ? "安全" : "手动"}</Badge></div><div className="backup-copy"><input aria-label={`备份名称 ${formatDateTime(backup.createdAt)}`} defaultValue={backup.label} placeholder="添加备份名称" onBlur={(event) => { if (event.target.value.trim() !== backup.label) void run(() => api.updateBackup(backup.id, { label: event.target.value })); }} /><small>{formatDateTime(backup.createdAt)} · {formatBytes(backup.size)}</small></div><label className="keep-check"><input type="checkbox" checked={backup.keep} onChange={(event) => void run(() => api.updateBackup(backup.id, { keep: event.target.checked }))} />长期保留</label><Button variant="ghost" size="sm" onClick={() => setRestoreId(backup.id)}><ArrowCounterClockwise size={15} />恢复</Button><Button variant="ghost" size="sm" onClick={() => setDeleteId(backup.id)}><Trash size={15} />删除</Button></article>)}</div> : <EmptyState title="还没有备份" description="创建第一份完整备份。" />}
        </Section>
        <Section title="数据导出" description="选择需要导出的项目，生成Excel文件（每个模块一个工作表）">
          <div className="export-modules-grid">
            <label className={"export-module-item" + (exportModules.includes("all") ? " active" : "")}>
              <input type="checkbox" checked={exportModules.includes("all")} onChange={() => toggleExportModule("all")} />
              <span>全选</span>
            </label>
            {exportableModules.map(mod => (
              <label key={mod.key} className={"export-module-item" + (exportModules.includes(mod.key) || exportModules.includes("all") ? " active" : "")}>
                <input type="checkbox" checked={exportModules.includes("all") || exportModules.includes(mod.key)} onChange={() => toggleExportModule(mod.key)} />
                <span>{mod.label}</span>
              </label>
            ))}
          </div>
          <div className="export-panel">
            <DownloadSimple size={28} />
            <div>
              <strong>导出选中数据</strong>
              <p>已选择 {exportModules.includes("all") ? "全部" : exportModules.length} 个项目，每个模块一个工作表。</p>
            </div>
            <Button variant="secondary" onClick={exportDataFile}>导出 Excel</Button>
          </div>
        </Section>
      </div>

      <AppUpdateSection />

      {!isNativeApp() && (
      <Section title="百度网盘备份" description="将备份自动同步到百度网盘同步目录，无需额外服务器" action={
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" onClick={() => void detectBaidu()}><MagnifyingGlass size={16} />自动检测</Button>
          <Button loading={baiduSyncing} onClick={() => void syncBaidu()}><ArrowClockwise size={16} />立即同步</Button>
        </div>
      }>
        <div className="baidu-backup-panel">
          <div className="baidu-backup-row">
            <label className="baidu-toggle">
              <input
                type="checkbox"
                checked={baiduConfig.data?.enabled ?? false}
                onChange={(e) => void saveBaiduConfig({ enabled: e.target.checked })}
              />
              <span>启用百度网盘自动备份</span>
            </label>
            {baiduConfig.data?.lastSyncStatus === "success" && baiduConfig.data.lastSyncAt ? (
              <Badge tone="success"><Check size={12} />上次同步：{formatDateTime(baiduConfig.data.lastSyncAt)}</Badge>
            ) : baiduConfig.data?.lastSyncStatus === "error" ? (
              <Badge tone="danger">同步失败：{baiduConfig.data.lastSyncError || "未知错误"}</Badge>
            ) : (
              <Badge tone="neutral">尚未同步</Badge>
            )}
          </div>
          <div className="baidu-path-row">
            <span>网盘同步目录</span>
            <input
              type="text"
              value={baiduPath}
              onChange={(e) => setBaiduPath(e.target.value)}
              placeholder="如：C:\Users\你的用户名\BaiduNetdisk"
              onBlur={() => baiduPath !== baiduConfig.data?.netdiskPath && void saveBaiduConfig({ netdiskPath: baiduPath })}
            />
            <Button variant="ghost" size="sm" onClick={() => void saveBaiduConfig({ netdiskPath: baiduPath })}>保存路径</Button>
          </div>
          <div className="baidu-backup-hint">
            <Cloud size={16} />
            <span>启用后，每日自动备份完成后会自动复制到该目录下的 <code>sock-erp-backups</code> 文件夹。请确保已安装百度网盘客户端并登录，该目录会自动上传到云端。手动同步会同时备份浏览器中的业务数据。</span>
          </div>
          {baiduMsg ? <div className="baidu-backup-msg">{baiduMsg}</div> : null}
          {baiduConfig.data?.syncCount ? <div className="baidu-stats">累计同步 {baiduConfig.data.syncCount} 次</div> : null}
        </div>
      </Section>
      )}
      <Section title="分享与导出" description="分享APP给好友，导出数据文件，通过微信分享数据">
        <div className="preferences">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "#e8f5e9", display: "flex", alignItems: "center", justifyContent: "center" }}><ShareNetwork size={20} color="#4caf50" /></div>
              <div style={{ flex: 1 }}>
                <strong>分享APP给好友</strong>
                <small style={{ display: "block", color: "#666" }}>通过微信、QQ等分享APP下载链接</small>
              </div>
              <Button variant="secondary" size="sm" onClick={() => void shareApp()}>分享</Button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "#e3f2fd", display: "flex", alignItems: "center", justifyContent: "center" }}><FileJs size={20} color="#2196f3" /></div>
              <div style={{ flex: 1 }}>
                <strong>导出数据文件</strong>
                <small style={{ display: "block", color: "#666" }}>导出所有业务数据为JSON文件备份</small>
              </div>
              <Button variant="secondary" size="sm" onClick={exportDataFile}>导出</Button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "#fce4ec", display: "flex", alignItems: "center", justifyContent: "center" }}><WhatsappLogo size={20} color="#e91e63" /></div>
              <div style={{ flex: 1 }}>
                <strong>分享数据给微信好友</strong>
                <small style={{ display: "block", color: "#666" }}>{isMobile ? "导出数据后选择微信分享" : "电脑端请先导出文件，再通过微信发送"}</small>
              </div>
              <Button variant="secondary" size="sm" onClick={() => void shareDataToWechat()}>{isMobile ? "分享" : "导出"}</Button>
            </div>
          </div>
        </div>
      </Section>
      <Section title="使用偏好" description="设置会保存在主数据文件中">
        <div className="preferences">
          <div><div><strong>界面风格</strong><small>功能和数据保持一致，只改变视觉系统</small></div><div className="appearance-toggle style-toggle" role="group" aria-label="界面风格"><button className={appearance === "liquid" ? "active" : ""} aria-label="Liquid Glass" aria-pressed={appearance === "liquid"} onClick={() => void saveSetting("appearance", "liquid")}><span><Stack size={17} /><strong>Liquid Glass</strong></span><small>环境色、透明材质与柔和层次</small></button><button className={appearance === "notebook" ? "active" : ""} aria-label="Notion 笔记" aria-pressed={appearance === "notebook"} onClick={() => void saveSetting("appearance", "notebook")}><span><Notebook size={17} /><strong>Notion 笔记</strong></span><small>紧凑画布、纯平表面与低饱和标记</small></button><button className={appearance === "neo" ? "active" : ""} aria-label="Neo-Brutalism" aria-pressed={appearance === "neo"} onClick={() => void saveSetting("appearance", "neo")}><span><SquaresFour size={17} /><strong>Neo-Brutalism</strong></span><small>多色印刷、硬边框与机械反馈</small></button></div></div>
          <div><div><strong>界面主题</strong><small>选择适合长时间使用的明暗风格</small></div><div className="theme-toggle" role="group" aria-label="界面主题"><button className={(data.settings.theme ?? "light") === "light" ? "active" : ""} aria-pressed={(data.settings.theme ?? "light") === "light"} onClick={() => void saveSetting("theme", "light")}><Sun size={16} />浅色</button><button className={data.settings.theme === "dark" ? "active" : ""} aria-pressed={data.settings.theme === "dark"} onClick={() => void saveSetting("theme", "dark")}><Moon size={16} />深色</button></div></div>
          <label><div><strong>每周起始日</strong><small>影响本月总览的本周视图</small></div><select value={data.settings.weekStart ?? "monday"} onChange={(event) => void saveSetting("weekStart", event.target.value)}><option value="monday">星期一</option><option value="sunday">星期日</option></select></label>
          <label><div><strong>日期格式</strong><small>用于列表和时间线</small></div><select value={data.settings.dateFormat ?? "zh-CN"} onChange={(event) => void saveSetting("dateFormat", event.target.value)}><option value="zh-CN">中文日期</option><option value="iso">YYYY-MM-DD</option></select></label>
          <fieldset className="dashboard-options"><legend><strong>首页模块摘要</strong><small>选择首页底部需要显示的模块</small></legend><div>{dashboardOptions.map((option) => <label key={option.value}><input type="checkbox" checked={visibleModules.includes(option.value)} onChange={(event) => toggleDashboardModule(option.value, event.target.checked)} />{option.label}</label>)}</div></fieldset>
        </div>
      </Section>
      <Section title="回收站" description="删除记录先进入这里，永久删除需要再次确认">
        {data.trash.length ? <div className="trash-list">{data.trash.map((item) => <article key={item.id}><Trash size={18} /><div><strong>{item.display_title}</strong><small>{collectionLabels[item.collection] || item.collection} · 删除于 {formatDateTime(item.deleted_at)}</small></div><Button variant="ghost" size="sm" onClick={() => void run(() => api.restore(item.collection as CollectionName, item.entity_id))}><ArrowCounterClockwise size={15} />恢复</Button><Button variant="ghost" size="sm" className="danger-text" onClick={() => setPermanent({ collection: item.collection as CollectionName, id: item.entity_id, title: item.display_title })}>永久删除</Button></article>)}</div> : <p className="quiet-line">回收站是空的。</p>}
      </Section>
      <ConfirmDialog open={Boolean(restoreId)} title="恢复这份备份？" description={selectedBackup ? `${selectedBackup.label || selectedBackup.filename} · ${formatDateTime(selectedBackup.createdAt)} · ${formatBytes(selectedBackup.size)}。恢复前会先为当前数据创建安全备份。` : "恢复前会先为当前数据创建安全备份。"} confirmLabel="创建安全备份并恢复" onClose={() => setRestoreId(null)} onConfirm={async () => { if (!restoreId) return; setBusy("restore"); try { await api.restoreBackup(restoreId); window.location.reload(); } finally { setBusy(""); } }} />
      <ConfirmDialog open={Boolean(deleteId)} title="删除这份备份？" description={selectedDeleteBackup ? `${selectedDeleteBackup.label || selectedDeleteBackup.filename} · ${formatDateTime(selectedDeleteBackup.createdAt)} · ${formatBytes(selectedDeleteBackup.size)}。删除后无法恢复。` : "删除后无法恢复。"} confirmLabel="确认删除" danger onClose={() => setDeleteId(null)} onConfirm={async () => { if (!deleteId) return; setBusy("delete"); try { await api.deleteBackup(deleteId); setDeleteId(null); await backups.refetch(); } finally { setBusy(""); } }} />
      <ConfirmDialog open={Boolean(permanent)} title="永久删除这条记录？" description={`“${permanent?.title ?? "记录"}”将无法从回收站恢复。`} confirmLabel="永久删除" danger onClose={() => setPermanent(null)} onConfirm={async () => { if (permanent) await run(() => api.permanentDelete(permanent.collection, permanent.id)); }} />
    </div>
  );
}
