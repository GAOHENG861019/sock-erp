import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Plus, Barbell, ListPlus, Bug, Factory, Package, SlidersHorizontal } from "@phosphor-icons/react";
import { api } from "../api";
import { useWorkspace } from "../WorkspaceContext";
import { localDate } from "../utils";
import { Button, ErrorState, Modal, PageHeader, Section, Skeleton } from "../components/ui";
import { ModuleArtwork, type ModuleArtworkName } from "../components/ModuleArtwork";

function readLS<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}

const summaryMeta: Record<string, { title: string; route: string; module: ModuleArtworkName; empty: string }> = {
  development: { title: "商品管理", route: "/development", module: "development", empty: "暂无商品信息" },
  consulting: { title: "仓库管理", route: "/consulting", module: "consulting", empty: "暂无仓库商品" },
  customer: { title: "客户中心", route: "/customer", module: "consulting", empty: "暂无客户记录" },
  fitness: { title: "原材料采购", route: "/fitness", module: "fitness", empty: "暂无近期采购" },
  diet: { title: "库存盘点", route: "/diet", module: "diet", empty: "暂无盘点记录" },
  entertainment: { title: "机器损耗", route: "/entertainment", module: "entertainment", empty: "暂无损耗记录" },
};

export function DashboardPage() {
  const date = localDate();
  const dashboard = useQuery({ queryKey: ["dashboard", date], queryFn: async () => { try { return (await api.dashboard(date)) ?? null; } catch { return null; } } });
  const { data, run } = useWorkspace();
  const navigate = useNavigate();

  // 各模块摘要自定义（显示/隐藏），持久化到 settings.dashboardModules
  const allModuleKeys = Object.keys(summaryMeta);
  const persistedModules = Array.isArray(data.settings.dashboardModules)
    ? allModuleKeys.filter((key) => data.settings.dashboardModules.includes(key))
    : allModuleKeys;
  const [customOpen, setCustomOpen] = useState(false);
  const [draftModules, setDraftModules] = useState<string[] | null>(null);
  const visibleModuleKeys = draftModules ?? persistedModules;
  const openCustom = () => { setDraftModules(persistedModules); setCustomOpen(true); };
  const toggleModule = (key: string) => {
    setDraftModules((prev) => {
      const base = prev ?? persistedModules;
      return base.includes(key) ? base.filter((k) => k !== key) : [...base, key];
    });
  };
  const saveCustom = () => {
    const next = draftModules ?? persistedModules;
    void run(() => api.saveSettings({ dashboardModules: next })).catch(() => undefined);
    setCustomOpen(false);
  };
  const resetCustom = () => { setDraftModules(allModuleKeys); };

  // 生产数据统计（从 localStorage 读取）
  const rawFanwa = readLS<any[]>("sock-erp-fanwa", []);
  const rawFengtou = readLS<any[]>("sock-erp-fengtou", []);
  const rawDingxing = readLS<any[]>("sock-erp-dingxing", []);
  const rawInventory = readLS<any[]>("sock-erp-finished-inventory", []);
  const fanwa = Array.isArray(rawFanwa) ? rawFanwa : [];
  const fengtou = Array.isArray(rawFengtou) ? rawFengtou : [];
  const dingxing = Array.isArray(rawDingxing) ? rawDingxing : [];
  const finishedInventory = Array.isArray(rawInventory) ? rawInventory : [];
  const dingxingMap = useMemo(() => {
    const m: Record<string, any> = {};
    dingxing.forEach((d) => { m[d.id] = d; });
    return m;
  }, [dingxing]);
  const warehouseByColorSpec = useMemo(() => {
    const groups: Record<string, { packages: number; weightKg: number }> = {};
    finishedInventory.forEach((inv) => {
      const dx = dingxingMap[inv.linkedId];
      const color = dx?.color || "未分类";
      const spec = dx?.spec || "未分类";
      const key = `${color}|${spec}`;
      if (!groups[key]) groups[key] = { packages: 0, weightKg: 0 };
      const sign = inv.type === "out" ? -1 : 1;
      groups[key].packages += sign * Number(inv.quantity || 0);
      groups[key].weightKg += sign * Number(inv.weightKg || 0);
    });
    return groups;
  }, [finishedInventory, dingxingMap]);

  if (dashboard.isLoading) return <><PageHeader icon={<ModuleArtwork module="dashboard" />} eyebrow="今天" title="正在整理你的系统" description="读取本月计划和各模块状态" /><Skeleton lines={8} /></>;
  if (dashboard.error) return <ErrorState message={(dashboard.error as Error)?.message ?? "首页数据不可用"} onRetry={() => dashboard.refetch()} />;
  const value = dashboard.data || { summaries: {} as Record<string, any[]> };

  const sumAmt = (arr: any[]) => arr.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unitPrice || 0), 0);
  const baoOnly = (arr: any[]) => arr.filter((i) => i.spec === "包").reduce((s, i) => s + Number(i.quantity || 0), 0);
  const groupByKey = (arr: any[], key: string) => {
    const groups: Record<string, number> = {};
    arr.forEach((i) => {
      if (i.spec !== "包") return;
      const k = i[key] || "未分类";
      groups[k] = (groups[k] || 0) + Number(i.quantity || 0);
    });
    return groups;
  };
  const breakdownText = (groups: Record<string, number>) =>
    Object.entries(groups).map(([k, v]) => `${k}:${v}包`).join(" ") || "暂无";
  const fanwaByName = groupByKey(fanwa, "name");
  const fengtouByName = groupByKey(fengtou, "name");
  const dingxingByColor = groupByKey(dingxing, "color");

  return (
    <div className="dashboard-page">
      <PageHeader icon={<ModuleArtwork module="dashboard" />} eyebrow={new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(new Date())} title={`${new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(new Date())}，从重点开始`} description="今天的行动、提醒和业务状态都在这里。" actions={<Button onClick={() => navigate("/today?new=1")}><Plus size={17} />添加当日产量</Button>} />
      <Section title="生产数据总览" description="翻袜、缝头、定型累计金额与仓库余量">
        <div className="prod-overview-grid">
          <div className="prod-overview-card" onClick={() => navigate("/fanwa")}><div className="pov-icon"><Factory size={22} /></div><span>翻袜</span><strong>{baoOnly(fanwa)}包</strong><small>¥{sumAmt(fanwa).toFixed(0)}</small><small className="pov-breakdown">{breakdownText(fanwaByName)}</small></div>
          <div className="prod-overview-card" onClick={() => navigate("/fengtou")}><div className="pov-icon"><Factory size={22} /></div><span>缝头</span><strong>{baoOnly(fengtou)}包</strong><small>¥{sumAmt(fengtou).toFixed(0)}</small><small className="pov-breakdown">{breakdownText(fengtouByName)}</small></div>
          <div className="prod-overview-card" onClick={() => navigate("/dingxing")}><div className="pov-icon"><Factory size={22} /></div><span>定型</span><strong>{baoOnly(dingxing)}包</strong><small>¥{sumAmt(dingxing).toFixed(0)}</small><small className="pov-breakdown">{breakdownText(dingxingByColor)}</small></div>
          {Object.entries(warehouseByColorSpec).map(([key, val]) => {
            const [color, spec] = key.split("|");
            return (
              <div key={key} className="prod-overview-card" onClick={() => navigate("/warehouse")}><div className="pov-icon"><Package size={22} /></div><span>{color}</span><strong>{val.packages}包</strong><small>{val.weightKg}公斤</small><small className="pov-breakdown">规格：{spec}</small></div>
            );
          })}
          {Object.keys(warehouseByColorSpec).length === 0 && (
            <div className="prod-overview-card" onClick={() => navigate("/warehouse")}><div className="pov-icon"><Package size={22} /></div><span>仓库余量</span><strong>0包</strong><small>0公斤</small><small className="pov-breakdown">暂无库存</small></div>
          )}
        </div>
      </Section>
      <nav className="dashboard-command-strip glass-clear" aria-label="快速操作">
        <span>快速操作</span>
        <button onClick={() => navigate("/today?new=1")}><ListPlus size={17} />当日产量</button>
        <button onClick={() => navigate("/warehouse")}><Package size={17} />添加商品</button>
        <button onClick={() => navigate("/fitness")}><Barbell size={17} />记录采购</button>
        <button onClick={() => navigate("/expense-stats")}><Bug size={17} />支出统计</button>
      </nav>
      <Section title="各模块摘要" description="只展示近期真正需要留意的内容" action={<Button variant="ghost" size="sm" onClick={openCustom}><SlidersHorizontal size={15} />自定义</Button>}>
        <div className="summary-grid">{visibleModuleKeys.length ? Object.entries(summaryMeta).filter(([key]) => visibleModuleKeys.includes(key)).map(([key, meta]) => {
          const items = value.summaries[key] ?? [];
          return <button className="summary-tile" data-module={key} key={key} onClick={() => navigate(meta.route)}><div className="summary-top"><ModuleArtwork module={meta.module} loading="lazy" /><span>{meta.title}</span><ArrowRight size={16} /></div>{items.length ? <><strong>{items[0].title || items[0].name || items[0].content}</strong><small>{items.length > 1 ? `另外还有 ${items.length - 1} 项` : "查看详情"}</small></> : <small>{meta.empty}</small>}</button>;
        }) : <p className="quiet-line">已隐藏全部模块，点击右上角“自定义”选择要显示的模块。</p>}</div>
      </Section>
      <Modal open={customOpen} title="自定义模块摘要" description="勾选首页“各模块摘要”中需要显示的模块" onClose={() => setCustomOpen(false)}>
        <div className="export-modules-grid">
          {allModuleKeys.map((key) => (
            <label key={key} className={"export-module-item" + (visibleModuleKeys.includes(key) ? " active" : "")}>
              <input type="checkbox" checked={visibleModuleKeys.includes(key)} onChange={() => toggleModule(key)} />
              <span>{summaryMeta[key].title}</span>
            </label>
          ))}
        </div>
        <footer className="modal-actions">
          <Button variant="ghost" size="sm" onClick={resetCustom}>全选</Button>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" size="sm" onClick={() => setCustomOpen(false)}>取消</Button>
          <Button size="sm" onClick={saveCustom}>完成</Button>
        </footer>
      </Modal>
    </div>
  );
}
