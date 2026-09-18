import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CalendarPlus, Check, Clock, DotsThree, ArrowBendDownRight, Trash, Play, X, ArrowSquareOut } from "@phosphor-icons/react";
import { api } from "../api";
import { useWorkspace } from "../WorkspaceContext";
import { addDays, classNames, formatDate, formatDuration, localDate } from "../utils";
import { Badge, Button, EmptyState, EntityForm, Modal, PageHeader, Section, type FieldDefinition } from "../components/ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

const fields: FieldDefinition[] = [
  { name: "title", label: "事项名称", required: true, placeholder: "例如：完成咨询方案" },
  { name: "plan_date", label: "日期", type: "date", required: true },
  { name: "start_time", label: "开始时间", type: "time" },
  { name: "estimated_minutes", label: "预计分钟", type: "number", placeholder: "60" },
  { name: "priority", label: "优先级", type: "select", required: true, options: [{ value: "low", label: "低" }, { value: "medium", label: "普通" }, { value: "high", label: "高" }] },
  { name: "notes", label: "备注", type: "textarea", placeholder: "补充执行说明" },
];

export function TodayPage() {
  const { data, registerSaveHandler, run } = useWorkspace();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<"today" | "week" | "history">("today");
  const [selectedDate, setSelectedDate] = useState(localDate());
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [review, setReview] = useState("");
  const [savedReview, setSavedReview] = useState("");
  const newOpen = params.get("new") === "1";
  const openForm = (item: Record<string, any> | null = null) => { setEditing(item ?? {}); if (!item) setParams({ new: "1" }); };
  const closeForm = () => { setEditing(null); setParams({}); };

  useEffect(() => {
    void api.getReview(selectedDate).then((value) => {
      const content = value?.content ?? "";
      setReview(content);
      setSavedReview(content);
    });
  }, [selectedDate]);

  const persistReview = useCallback(async () => {
    if (review === savedReview) return;
    await run(() => api.setReview(selectedDate, review));
    setSavedReview(review);
  }, [review, run, savedReview, selectedDate]);

  useEffect(() => registerSaveHandler(persistReview), [persistReview, registerSaveHandler]);

  const items = useMemo(() => {
    if (view === "today") return data.planItems.filter((item) => item.plan_date === selectedDate && item.status !== "cancelled");
    if (view === "week") {
      const end = addDays(selectedDate, 6);
      return data.planItems.filter((item) => item.plan_date >= selectedDate && item.plan_date <= end && item.status !== "cancelled");
    }
    return data.planItems.filter((item) => item.plan_date < selectedDate || ["done", "cancelled"].includes(item.status));
  }, [data.planItems, selectedDate, view]);
  const ordered = [...items].sort((a, b) => `${a.plan_date}${a.start_time || "99:99"}`.localeCompare(`${b.plan_date}${b.start_time || "99:99"}`));
  const complete = items.filter((item) => item.status === "done").length;

  // 业务数据总览
  const readLS = <T,>(key: string, fallback: T): T => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as T;
      if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
      return parsed;
    } catch { return fallback; }
  };
  const dingxing = readLS<any[]>("sock-erp-dingxing", []);
  // 成品数量：关联定型，按包统计
  const finishedBao = dingxing.filter((i) => i.spec === "包").reduce((s, i) => s + Number(i.quantity || 0), 0);
  // 定型按颜色分组
  const dingxingByColor = useMemo(() => {
    const groups: Record<string, { bao: number; amount: number }> = {};
    dingxing.forEach((d) => {
      const color = d.color || "未分类";
      if (!groups[color]) groups[color] = { bao: 0, amount: 0 };
      if (d.spec === "包") groups[color].bao += Number(d.quantity || 0);
      groups[color].amount += Number(d.quantity || 0) * Number(d.unitPrice || 0);
    });
    return groups;
  }, [dingxing]);
  // 仓库余量：关联仓库管理（成品库存），只计算手动入库/出库（不关联定型自动入库）
  const finishedInv = readLS<any[]>("sock-erp-finished-inventory", []);
  const dxMap: Record<string, any> = {};
  dingxing.forEach((d) => { dxMap[d.id] = d; });
  const warehouseByColor: Record<string, { bao: number; kg: number }> = {};
  // 手动入库/出库记录
  finishedInv.forEach((inv) => {
    const dx = dxMap[inv.linkedId];
    const color = dx?.color || "未分类";
    if (!warehouseByColor[color]) warehouseByColor[color] = { bao: 0, kg: 0 };
    const sign = inv.type === "out" ? -1 : 1;
    warehouseByColor[color].bao += sign * Number(inv.quantity || 0);
    warehouseByColor[color].kg += sign * Number(inv.weightKg || 0);
  });
  const warehouseTotalBao = Object.values(warehouseByColor).reduce((s, v) => s + v.bao, 0);
  const warehouseTotalKg = Object.values(warehouseByColor).reduce((s, v) => s + v.kg, 0);
  const warehouseColorText = Object.entries(warehouseByColor).map(([c, v]) => `${c}:${v.bao}包${v.kg}公斤`).join(" ") || "暂无库存";
  // 仓库重量：关联原材料采购+原材料库存手动出入库，按名称统计包数和总重量
  const rawMaterials = readLS<any[]>("sock-erp-raw-materials", []);
  const materialInv = readLS<any[]>("sock-erp-material-inventory", []);
  const rawMap: Record<string, any> = {};
  rawMaterials.forEach((m) => { rawMap[m.id] = m; });
  const materialByName: Record<string, { bao: number; kg: number }> = {};
  // 原材料采购自动入库
  rawMaterials.forEach((m) => {
    const name = m.name || "未分类";
    if (!materialByName[name]) materialByName[name] = { bao: 0, kg: 0 };
    materialByName[name].bao += Number(m.packages || 0);
    materialByName[name].kg += Number(m.packages || 0) * Number(m.weight || 0);
  });
  // 原材料库存手动入库/出库
  materialInv.forEach((inv) => {
    const raw = rawMap[inv.linkedId];
    const name = raw?.name || "未分类";
    if (!materialByName[name]) materialByName[name] = { bao: 0, kg: 0 };
    const sign = inv.type === "out" ? -1 : 1;
    materialByName[name].bao += sign * Number(inv.packages || 0);
    materialByName[name].kg += sign * Number(inv.quantity || 0);
  });
  const materialTotalBao = Object.values(materialByName).reduce((s, v) => s + v.bao, 0);
  const materialTotalKg = Object.values(materialByName).reduce((s, v) => s + v.kg, 0);
  const materialText = Object.entries(materialByName).map(([n, v]) => `${n}:${v.bao}包${v.kg.toFixed(1)}公斤`).join(" ") || "暂无原材料";
  // 支出收入
  const machineLoss = readLS<any[]>("sock-erp-machine-loss", []);
  const freight = readLS<any[]>("sock-erp-freight", []);
  const salary = readLS<any[]>("sock-erp-salary", []);
  const monthExpense = [...machineLoss, ...freight, ...salary, ...rawMaterials].reduce((s, i) => s + Number(i.amount || 0), 0);
  const income = readLS<any[]>("sock-erp-income", []);
  const monthIncome = income.reduce((s, i) => s + Number(i.amount || 0), 0);

  const overviewCards = [
    { label: "成品数量", value: `${finishedBao}包`, color: "#3498db", icon: "📦" },
    { label: "仓库余量", value: `${warehouseTotalBao}包 ${warehouseTotalKg}公斤`, color: "#2ecc71", icon: "🏭" },
    { label: "仓库重量", value: `${materialTotalBao}包 ${materialTotalKg.toFixed(0)}公斤`, color: "#9b59b6", icon: "📊" },
    { label: "本月支出", value: `¥${monthExpense.toFixed(0)}`, color: "#e74c3c", icon: "💸" },
    { label: "本月收入", value: `¥${monthIncome.toFixed(0)}`, color: "#f39c12", icon: "💰" },
  ];

  return (
    <div>
      <PageHeader icon={<ModuleArtwork module="today" />} eyebrow="月度执行" title="本月总览" description="只安排本月何时执行什么，业务详情仍留在对应模块。" actions={<Button onClick={() => openForm()}><CalendarPlus size={18} />添加当日产量</Button>} />
      <div className="month-overview-grid">
        {overviewCards.map((card) => (
          <div key={card.label} className="month-overview-card" style={{ borderLeft: `4px solid ${card.color}` }}>
            <span className="moc-icon" style={{ background: `${card.color}20`, color: card.color }}>{card.icon}</span>
            <div>
              <small>{card.label}</small>
              <strong style={{ color: card.color }}>{card.value}</strong>
            </div>
          </div>
        ))}
      </div>
      <Section title="定型按颜色统计" description="成品定型按颜色分别统计数量和金额">
        {Object.keys(dingxingByColor).length ? (
          <div className="prod-overview-grid">
            {Object.entries(dingxingByColor).map(([color, stats]) => (
              <div key={color} className="prod-overview-card">
                <div className="pov-icon" style={{ background: "#9b59b620", color: "#9b59b6" }}>🎨</div>
                <span>{color}</span>
                <strong>{stats.bao}包</strong>
                <small>¥{stats.amount.toFixed(0)}</small>
              </div>
            ))}
          </div>
        ) : <p className="quiet-line">暂无定型记录</p>}
      </Section>
      <Section title="仓库余量按颜色" description="关联仓库管理成品库存出入库记录，按颜色分别显示包数和公斤数">
        {Object.keys(warehouseByColor).length ? (
          <div className="prod-overview-grid">
            {Object.entries(warehouseByColor).map(([color, stats]) => (
              <div key={color} className="prod-overview-card">
                <div className="pov-icon" style={{ background: "#2ecc7120", color: "#2ecc71" }}>🏭</div>
                <span>{color}</span>
                <strong>{stats.bao}包</strong>
                <small>{stats.kg}公斤</small>
              </div>
            ))}
          </div>
        ) : <p className="quiet-line">暂无仓库库存</p>}
      </Section>
      <Section title="仓库重量按原材料" description="关联原材料采购和原材料库存出入库，按名称分别显示包数和总重量">
        {Object.keys(materialByName).length ? (
          <div className="prod-overview-grid">
            {Object.entries(materialByName).map(([name, stats]) => (
              <div key={name} className="prod-overview-card">
                <div className="pov-icon" style={{ background: "#f39c1220", color: "#f39c12" }}>📊</div>
                <span>{name}</span>
                <strong>{stats.bao}包</strong>
                <small>{stats.kg.toFixed(1)}公斤</small>
              </div>
            ))}
          </div>
        ) : <p className="quiet-line">暂无原材料</p>}
      </Section>
      <div className="plan-toolbar">
        <div className="segmented" role="tablist">{(["today", "week", "history"] as const).map((key) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}>{key === "today" ? "今日" : key === "week" ? "本周" : "历史"}</button>)}</div>
        <label className="date-control"><span>起始日期</span><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>
        <div className="plan-stat"><span>完成</span><strong>{complete}/{items.length}</strong></div>
        <div className="plan-stat"><span>预计</span><strong>{formatDuration(items.reduce((sum, item) => sum + Number(item.estimated_minutes || 0), 0))}</strong></div>
      </div>
      <Section title={view === "today" ? formatDate(selectedDate) : view === "week" ? "未来七天" : "历史记录"} description={view === "today" ? "按时间顺序处理；没有时间的事项排在最后。" : "按日期查看计划状态。"}>
        {ordered.length ? <div className="plan-table">{ordered.map((item) => <div className={classNames("plan-table-row", item.status === "done" && "is-done")} key={item.id}>
          <button className="complete-control" disabled={item.status === "done"} onClick={() => void run(() => api.completePlan(item.id))}>{item.status === "done" ? <Check size={14} /> : item.status === "doing" ? <Play size={12} /> : null}</button>
          <div className="date-block"><strong>{item.start_time || "待安排"}</strong>{view !== "today" ? <small>{formatDate(item.plan_date)}</small> : null}</div>
          <div className="plan-copy"><strong>{item.display_title || item.title}</strong><small>{item.notes || (item.source_module ? `来自 ${sourceLabels[item.source_module] ?? item.source_module}` : "独立事项")}</small>{item.source_module ? <button className="text-button source-link" onClick={() => navigate(sourceRoutes[item.source_module] ?? "/")}>打开来源 <ArrowSquareOut size={13} /></button> : null}</div>
          <Badge tone={item.priority === "high" ? "warning" : item.status === "done" ? "success" : "neutral"}>{item.status === "done" ? "已完成" : item.priority === "high" ? "高优先" : "待处理"}</Badge>
          <div className="row-menu-wrap"><button className="icon-button" onClick={() => setMenu(menu === item.id ? null : item.id)}><DotsThree size={20} /></button>{menu === item.id ? <div className="row-menu"><button onClick={() => { openForm(item); setMenu(null); }}><Clock size={15} />调整时间</button><button onClick={() => void run(() => api.update("planItems", item.id, { status: "doing" }))}><Play size={15} />开始执行</button><button onClick={() => void run(() => api.postponePlan(item.id, addDays(item.plan_date, 1)))}><ArrowBendDownRight size={15} />移到明天</button><button onClick={() => void run(() => api.update("planItems", item.id, { status: "cancelled" }))}><X size={15} />取消</button><button className="danger" onClick={() => void run(() => api.remove("planItems", item.id))}><Trash size={15} />移到回收站</button></div> : null}</div>
        </div>)}</div> : <EmptyState title="这个时间范围还没有计划" description="添加第一件需要执行的事情。" action={<Button variant="secondary" onClick={() => openForm()}>添加当日产量</Button>} />}
      </Section>
      {view === "today" ? <Section title="当日复盘" description="一句话记录今天做得如何"><textarea className="review-input" value={review} onChange={(event) => setReview(event.target.value)} onBlur={() => void persistReview().catch(() => undefined)} placeholder="今天最值得记住的进展、问题或调整……" /></Section> : null}
      <Modal open={newOpen || editing !== null} title={editing?.id ? "编辑计划事项" : "添加计划事项"} description="时间可以暂时留空，之后再安排。" onClose={closeForm}>
        <EntityForm fields={fields} initial={{ plan_date: selectedDate, priority: "medium", ...editing }} onCancel={closeForm} onSubmit={async (values) => { if (editing?.id) await run(() => api.update("planItems", editing.id, values)); else await run(() => api.create("planItems", values)); closeForm(); }} />
      </Modal>
    </div>
  );
}

const sourceRoutes: Record<string, string> = { media: "/media", development: "/development", consulting: "/consulting", fitness: "/fitness", diet: "/diet", entertainment: "/entertainment" };
const sourceLabels: Record<string, string> = { media: "工作进度", development: "商品管理", consulting: "仓库管理", fitness: "原材料采购", diet: "库存盘点", entertainment: "采购单" };
