import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Check, Clock, ArrowRight, NotePencil, CalendarBlank, Plus, Barbell, ListPlus, Bug, Factory, Package, GridFour } from "@phosphor-icons/react";
import { api } from "../api";
import { useWorkspace } from "../WorkspaceContext";
import { localDate, formatDate, classNames } from "../utils";
import { Badge, Button, EmptyState, ErrorState, PageHeader, Section, Skeleton } from "../components/ui";
import { ModuleArtwork, type ModuleArtworkName } from "../components/ModuleArtwork";

function readLS<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}

const summaryMeta: Record<string, { title: string; route: string; module: ModuleArtworkName; empty: string }> = {
  media: { title: "工作进度", route: "/media", module: "media", empty: "暂无待处理工作" },
  development: { title: "商品管理", route: "/development", module: "development", empty: "暂无商品信息" },
  consulting: { title: "仓库管理", route: "/consulting", module: "consulting", empty: "暂无仓库商品" },
  customer: { title: "客户中心", route: "/customer", module: "consulting", empty: "暂无客户记录" },
  fitness: { title: "原材料采购", route: "/fitness", module: "fitness", empty: "暂无近期采购" },
  diet: { title: "库存盘点", route: "/diet", module: "diet", empty: "暂无盘点记录" },
  entertainment: { title: "机器损耗", route: "/entertainment", module: "entertainment", empty: "暂无损耗记录" },
};

export function DashboardPage() {
  const date = localDate();
  const dashboard = useQuery({ queryKey: ["dashboard", date], queryFn: () => api.dashboard(date) });
  const { data, registerSaveHandler, run } = useWorkspace();
  const navigate = useNavigate();
  const activeMemo = useMemo(() => data.quickMemos.find((item) => !item.archived_at && !item.converted_id), [data.quickMemos]);
  const [memo, setMemo] = useState(activeMemo?.content ?? "");
  const [memoId, setMemoId] = useState<string | null>(activeMemo?.id ?? null);
  const [savedMemo, setSavedMemo] = useState(activeMemo?.content ?? "");
  const [memoError, setMemoError] = useState("");
  const memoInput = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (activeMemo && !memoId) { setMemo(activeMemo.content); setSavedMemo(activeMemo.content); setMemoId(activeMemo.id); }
  }, [activeMemo, memoId]);

  const persistMemo = useCallback(async () => {
    if (memo === savedMemo || (!memo.trim() && !memoId)) return;
    try {
      setMemoError("");
      if (memoId) await run(() => api.update("quickMemos", memoId, { content: memo }));
      else {
        const created = await run(() => api.create("quickMemos", { content: memo }));
        setMemoId(created.id);
      }
      setSavedMemo(memo);
    } catch (error) {
      setMemoError((error as Error).message);
      throw error;
    }
  }, [memo, memoId, run, savedMemo]);

  useEffect(() => {
    if (memo === savedMemo || (!memo.trim() && !memoId)) return;
    const timer = window.setTimeout(() => void persistMemo().catch(() => undefined), 700);
    return () => window.clearTimeout(timer);
  }, [memo, memoId, persistMemo, savedMemo]);

  useEffect(() => registerSaveHandler(persistMemo), [persistMemo, registerSaveHandler]);

  if (dashboard.isLoading) return <><PageHeader icon={<ModuleArtwork module="dashboard" />} eyebrow="今天" title="正在整理你的系统" description="读取本月计划和各模块状态" /><Skeleton lines={8} /></>;
  if (dashboard.error || !dashboard.data) return <ErrorState message={(dashboard.error as Error)?.message ?? "首页数据不可用"} onRetry={() => dashboard.refetch()} />;
  const value = dashboard.data;

  // 生产数据统计（从 localStorage 读取）
  const fanwa = readLS<any[]>("sock-erp-fanwa", []);
  const fengtou = readLS<any[]>("sock-erp-fengtou", []);
  const dingxing = readLS<any[]>("sock-erp-dingxing", []);
  const sumQty = (arr: any[]) => arr.reduce((s, i) => s + Number(i.quantity || 0), 0);
  const sumAmt = (arr: any[]) => arr.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unitPrice || 0), 0);
  const fmtQty = (arr: any[]) => {
    const shuang = arr.filter((i) => i.spec === "双").reduce((s, i) => s + Number(i.quantity || 0), 0);
    const bao = arr.filter((i) => i.spec === "包").reduce((s, i) => s + Number(i.quantity || 0), 0);
    const parts: string[] = [];
    if (shuang) parts.push(`${shuang}双`);
    if (bao) parts.push(`${bao}包`);
    return parts.length ? parts.join("+") : "0";
  };
  const warehouseCount = data.consultingProjects.length + data.consultingInteractions.length;

  // 仓库余量：按颜色统计成品库存（关联定型数据）
  const finishedInventory = readLS<any[]>("sock-erp-finished-inventory", []);
  const dingxingMap = useMemo(() => {
    const m: Record<string, any> = {};
    dingxing.forEach((d) => { m[d.id] = d; });
    return m;
  }, [dingxing]);
  const warehouseByColor = useMemo(() => {
    const groups: Record<string, { bao: number; shuang: number }> = {};
    finishedInventory.forEach((inv) => {
      const dx = dingxingMap[inv.linkedId];
      const color = dx?.color || "未分类";
      if (!groups[color]) groups[color] = { bao: 0, shuang: 0 };
      if (dx?.spec === "包") groups[color].bao += Number(inv.quantity || 0);
      else groups[color].shuang += Number(inv.quantity || 0);
    });
    return groups;
  }, [finishedInventory, dingxingMap]);
  const warehouseColorText = Object.entries(warehouseByColor).map(([color, q]) => {
    const parts: string[] = [];
    if (q.bao) parts.push(`${q.bao}包`);
    if (q.shuang) parts.push(`${q.shuang}双`);
    return `${color}:${parts.join("+") || "0"}`;
  }).join(" ") || "暂无库存";

  return (
    <div className="dashboard-page">
      <PageHeader icon={<ModuleArtwork module="dashboard" />} eyebrow={new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(new Date())} title={`${new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(new Date())}，从重点开始`} description="今天的行动、提醒和业务状态都在这里。" actions={<Button onClick={() => navigate("/today?new=1")}><Plus size={17} />添加当日产量</Button>} />
      <Section title="生产数据总览" description="翻袜、缝头、定型累计金额与仓库余量">
        <div className="prod-overview-grid">
          <div className="prod-overview-card" onClick={() => navigate("/fanwa")}><div className="pov-icon"><Factory size={22} /></div><span>翻袜</span><strong>¥{sumAmt(fanwa).toFixed(0)}</strong><small>数量 {fmtQty(fanwa)}</small></div>
          <div className="prod-overview-card" onClick={() => navigate("/fengtou")}><div className="pov-icon"><Factory size={22} /></div><span>缝头</span><strong>¥{sumAmt(fengtou).toFixed(0)}</strong><small>数量 {fmtQty(fengtou)}</small></div>
          <div className="prod-overview-card" onClick={() => navigate("/dingxing")}><div className="pov-icon"><Factory size={22} /></div><span>定型</span><strong>¥{sumAmt(dingxing).toFixed(0)}</strong><small>数量 {fmtQty(dingxing)}</small></div>
          <div className="prod-overview-card" onClick={() => navigate("/warehouse")}><div className="pov-icon"><GridFour size={22} /></div><span>产品中心</span><strong>管理</strong><small>翻袜/缝头/定型</small></div>
          <div className="prod-overview-card" onClick={() => navigate("/warehouse")}><div className="pov-icon"><Package size={22} /></div><span>仓库余量</span><strong>{finishedInventory.length}项</strong><small>{warehouseColorText}</small></div>
        </div>
      </Section>
      <nav className="dashboard-command-strip glass-clear" aria-label="快速操作">
        <span>快速操作</span>
        <button onClick={() => navigate("/today?new=1")}><ListPlus size={17} />当日产量</button>
        <button onClick={() => memoInput.current?.focus()}><NotePencil size={17} />记录备忘</button>
        <button onClick={() => navigate("/warehouse")}><Package size={17} />添加商品</button>
        <button onClick={() => navigate("/fitness")}><Barbell size={17} />记录采购</button>
        <button onClick={() => navigate("/expense-stats")}><Bug size={17} />支出统计</button>
      </nav>
      <div className="dashboard-grid">
        <div className="dashboard-primary">
          <Section title="当日产量" description="今日生产记录与待安排事项" action={<Button variant="ghost" size="sm" onClick={() => navigate("/today")}>打开总览<ArrowRight size={15} /></Button>}>
            {value.unscheduled.length ? <div className="plain-list">{value.unscheduled.map((item) => <PlanRow key={item.id} item={item} onComplete={() => run(() => api.completePlan(item.id))} onOpenSource={item.source_module ? () => navigate(sourceRoutes[item.source_module] ?? "/today") : undefined} />)}</div> : <EmptyState title="今日暂无产量记录" description="记录今天的翻袜、缝头、定型产量。" action={<Button variant="secondary" size="sm" onClick={() => navigate("/fanwa")}>记录翻袜</Button>} />}
          </Section>
        </div>
        <aside className="dashboard-aside">
          <Section title="快速备忘" description="停顿后自动保存" className="memo-section">
            <div className="memo-pad"><NotePencil size={19} /><textarea ref={memoInput} aria-label="快速备忘" value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="记下一闪而过的想法……" />{memoError ? <small className="field-error">{memoError}</small> : null}</div>
            {memoId ? <div className="memo-actions"><Button size="sm" variant="ghost" onClick={async () => { await run(() => api.convertMemo(memoId, "planItems", { plan_date: date })); setMemo(""); setSavedMemo(""); setMemoId(null); }}>转当日产量</Button><Button size="sm" variant="ghost" onClick={async () => { await run(() => api.convertMemo(memoId, "mediaContents", { stage: "idea" })); setMemo(""); setSavedMemo(""); setMemoId(null); }}>转为工作进度</Button></div> : null}
          </Section>
          <Section title="需要关注" description="到期、跟进与本月提醒">
            {value.attention.length ? <div className="attention-list">{value.attention.map((item) => <button key={`${item.attention_type}-${item.id}`} onClick={() => navigate(item.module === "today" ? "/today" : `/${item.module}`)}><span className="attention-mark" /><div><strong>{item.display_title || item.title || item.name || item.content}</strong><small>{item.due_date ? `截止 ${formatDate(item.due_date)}` : item.followup_at ? `跟进 ${formatDate(item.followup_at)}` : "需要处理"}</small></div><ArrowRight size={16} /></button>)}</div> : <p className="quiet-line">目前没有紧急事项。</p>}
          </Section>
        </aside>
      </div>
      <Section title="各模块摘要" description="只展示近期真正需要留意的内容">
        <div className="summary-grid">{Object.entries(summaryMeta).filter(([key]) => !Array.isArray(data.settings.dashboardModules) || data.settings.dashboardModules.includes(key)).map(([key, meta]) => {
          const items = value.summaries[key] ?? [];
          return <button className="summary-tile" data-module={key} key={key} onClick={() => navigate(meta.route)}><div className="summary-top"><ModuleArtwork module={meta.module} loading="lazy" /><span>{meta.title}</span><ArrowRight size={16} /></div>{items.length ? <><strong>{items[0].title || items[0].name || items[0].content}</strong><small>{items.length > 1 ? `另外还有 ${items.length - 1} 项` : "查看详情"}</small></> : <small>{meta.empty}</small>}</button>;
        })}</div>
      </Section>
    </div>
  );
}

const sourceRoutes: Record<string, string> = { media: "/media", development: "/development", consulting: "/consulting", customer: "/customer", fitness: "/fitness", diet: "/diet", entertainment: "/entertainment" };

function PlanRow({ item, onComplete, onOpenSource }: { item: Record<string, any>; onComplete: () => Promise<any>; onOpenSource?: () => void }) {
  const done = item.status === "done";
  return <div className={classNames("plan-row", done && "is-done")}><button className="complete-control" aria-label={done ? "已完成" : "标记完成"} disabled={done} onClick={() => void onComplete()}>{done ? <Check size={14} weight="bold" /> : null}</button>{item.start_time ? <span className="plan-time"><Clock size={14} />{item.start_time}</span> : <span className="plan-time"><CalendarBlank size={14} />待安排</span>}<div className="plan-copy"><strong>{item.display_title || item.title}</strong>{item.notes ? <small>{item.notes}</small> : null}{onOpenSource ? <button className="text-button source-link" onClick={onOpenSource}>打开来源 <ArrowRight size={13} /></button> : null}</div><Badge tone={item.priority === "high" ? "warning" : "neutral"}>{item.priority === "high" ? "高优先" : item.estimated_minutes ? `${item.estimated_minutes} 分钟` : "普通"}</Badge></div>;
}
