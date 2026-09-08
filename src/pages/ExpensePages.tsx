import { useEffect, useMemo, useState } from "react";
import { Plus, Trash, Calculator, Download } from "@phosphor-icons/react";
import { PageHeader, Section, Button, EmptyState } from "../components/ui";
import { ModuleArtwork, type ModuleArtworkName } from "../components/ModuleArtwork";

export type ExpenseItem = {
  id: string;
  date: string;
  amount: number;
  note: string;
  photo?: string;
};

function useLocalStorage<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* ignore */ } }, [key, state]);
  return [state, setState];
}

function genId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

/** 通用支出记录页：机器损耗 / 运货运费 / 工资支出 */
export function ExpenseRecordPage({
  eyebrow, title, description, module, storageKey, unitLabel = "元",
}: {
  eyebrow: string; title: string; description: string; module: ModuleArtworkName; storageKey: string; unitLabel?: string;
}) {
  const [items, setItems] = useLocalStorage<ExpenseItem[]>(storageKey, []);
  const [draft, setDraft] = useState<ExpenseItem>({ id: "", date: new Date().toISOString().slice(0, 10), amount: 0, note: "" });

  const total = useMemo(() => items.reduce((s, i) => s + Number(i.amount || 0), 0), [items]);

  const addItem = () => {
    if (!draft.amount || draft.amount <= 0) return;
    setItems((prev) => [...prev, { ...draft, id: genId() }]);
    setDraft({ id: "", date: new Date().toISOString().slice(0, 10), amount: 0, note: "" });
  };
  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setDraft({ ...draft, photo: reader.result as string });
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <PageHeader icon={<ModuleArtwork module={module} />} eyebrow={eyebrow} title={title} description={description} actions={<Button onClick={addItem}><Plus size={16} />添加记录</Button>} />
      <Section title="录入支出" description="填写日期、金额和备注，可上传凭证照片">
        <div className="production-input-row">
          <input className="prod-input" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          <input className="prod-input prod-num" type="number" min="0" step="0.01" placeholder="金额" value={draft.amount || ""} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) || 0 })} />
          <input className="prod-input" placeholder="备注" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} style={{ minWidth: 180 }} />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 13, color: "#666" }}>
            <input type="file" accept="image/*" onChange={handlePhoto} style={{ display: "none" }} />
            📷 {draft.photo ? "已选" : "凭证"}
          </label>
          {draft.photo ? <img src={draft.photo} alt="预览" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6 }} /> : null}
          <span className="prod-total-inline">¥{draft.amount.toFixed(2)}</span>
          <Button onClick={addItem}><Plus size={16} />添加</Button>
        </div>
      </Section>
      {items.length ? (
        <Section title="支出明细" description={`共 ${items.length} 条`}>
          <table className="prod-table">
            <thead><tr><th>日期</th><th>金额</th><th>备注</th><th>凭证</th><th>操作</th></tr></thead>
            <tbody>
              {[...items].sort((a, b) => b.date.localeCompare(a.date)).map((item) => (
                <tr key={item.id}>
                  <td>{item.date}</td>
                  <td><strong>¥{Number(item.amount).toFixed(2)}</strong></td>
                  <td>{item.note || "-"}</td>
                  <td>{item.photo ? <img src={item.photo} alt="凭证" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }} /> : <span style={{ color: "#999", fontSize: 12 }}>无</span>}</td>
                  <td><button className="icon-button danger-text" title="删除" onClick={() => removeItem(item.id)}><Trash size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="prod-summary prod-grand"><span><Calculator size={18} />支出合计：<strong>¥{total.toFixed(2)}</strong></span></div>
        </Section>
      ) : <EmptyState title="还没有支出记录" description="在上方填写日期和金额后点击添加。" />}
    </div>
  );
}

/** 支出统计页：三类支出占比、时间段筛选、导出报表 */
export function ExpenseStatsPage() {
  const [machine] = useLocalStorage<ExpenseItem[]>("sock-erp-machine-loss", []);
  const [freight] = useLocalStorage<ExpenseItem[]>("sock-erp-freight", []);
  const [salary] = useLocalStorage<ExpenseItem[]>("sock-erp-salary", []);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const filterByDate = (items: ExpenseItem[]) => {
    return items.filter((i) => {
      if (startDate && i.date < startDate) return false;
      if (endDate && i.date > endDate) return false;
      return true;
    });
  };

  const mFiltered = filterByDate(machine);
  const fFiltered = filterByDate(freight);
  const sFiltered = filterByDate(salary);

  const mTotal = mFiltered.reduce((s, i) => s + Number(i.amount || 0), 0);
  const fTotal = fFiltered.reduce((s, i) => s + Number(i.amount || 0), 0);
  const sTotal = sFiltered.reduce((s, i) => s + Number(i.amount || 0), 0);
  const grandTotal = mTotal + fTotal + sTotal;

  const pct = (v: number) => grandTotal > 0 ? ((v / grandTotal) * 100).toFixed(1) : "0.0";

  const exportCSV = () => {
    const rows = [
      ["类别", "日期", "金额", "备注"],
      ...mFiltered.map((i) => ["机器损耗", i.date, i.amount, i.note]),
      ...fFiltered.map((i) => ["运货运费", i.date, i.amount, i.note]),
      ...sFiltered.map((i) => ["工资支出", i.date, i.amount, i.note]),
      [],
      ["汇总", "", "", ""],
      ["机器损耗", "", mTotal.toFixed(2), `${pct(mTotal)}%`],
      ["运货运费", "", fTotal.toFixed(2), `${pct(fTotal)}%`],
      ["工资支出", "", sTotal.toFixed(2), `${pct(sTotal)}%`],
      ["总计", "", grandTotal.toFixed(2), "100%"],
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `支出统计_${startDate || "全部"}_${endDate || "全部"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const categories = [
    { name: "机器损耗", total: mTotal, color: "#e74c3c", route: "/entertainment" },
    { name: "运货运费", total: fTotal, color: "#3498db", route: "/sales-order" },
    { name: "工资支出", total: sTotal, color: "#2ecc71", route: "/salary" },
  ];

  return (
    <div>
      <PageHeader icon={<ModuleArtwork module="dashboard" />} eyebrow="财务统计" title="支出统计" description="三类支出占比分析，支持时间段筛选和导出报表。" actions={<Button onClick={exportCSV}><Download size={16} />导出CSV</Button>} />
      <Section title="筛选条件" description="按日期范围筛选支出记录">
        <div className="production-input-row">
          <span style={{ fontSize: 14, color: "#666" }}>开始日期</span>
          <input className="prod-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <span style={{ fontSize: 14, color: "#666" }}>结束日期</span>
          <input className="prod-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          {(startDate || endDate) && <Button variant="ghost" size="sm" onClick={() => { setStartDate(""); setEndDate(""); }}>清除筛选</Button>}
        </div>
      </Section>
      <Section title="三类支出占比" description={`筛选范围内总支出 ¥${grandTotal.toFixed(2)}`}>
        <div className="expense-stats-grid">
          {categories.map((cat) => (
            <div key={cat.name} className="expense-stat-card" style={{ borderTop: `4px solid ${cat.color}` }}>
              <span>{cat.name}</span>
              <strong>¥{cat.total.toFixed(2)}</strong>
              <div className="expense-bar"><span style={{ width: `${pct(cat.total)}%`, background: cat.color }} /></div>
              <small>占比 {pct(cat.total)}%</small>
            </div>
          ))}
        </div>
        <div className="prod-summary prod-grand" style={{ marginTop: 16 }}>
          <span><Calculator size={20} />支出总计：<strong>¥{grandTotal.toFixed(2)}</strong></span>
          <span>机器损耗 <strong style={{ color: "#e74c3c" }}>{pct(mTotal)}%</strong></span>
          <span>运货运费 <strong style={{ color: "#3498db" }}>{pct(fTotal)}%</strong></span>
          <span>工资支出 <strong style={{ color: "#2ecc71" }}>{pct(sTotal)}%</strong></span>
        </div>
      </Section>
      <Section title="支出明细汇总" description="筛选范围内的所有支出记录">
        {grandTotal > 0 ? (
          <table className="prod-table">
            <thead><tr><th>类别</th><th>日期</th><th>金额</th><th>备注</th></tr></thead>
            <tbody>
              {[...mFiltered.map((i) => ({ ...i, cat: "机器损耗" })), ...fFiltered.map((i) => ({ ...i, cat: "运货运费" })), ...sFiltered.map((i) => ({ ...i, cat: "工资支出" }))].sort((a, b) => b.date.localeCompare(a.date)).map((item) => (
                <tr key={item.id}>
                  <td><span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 12, background: item.cat === "机器损耗" ? "#fde8e8" : item.cat === "运货运费" ? "#e8f4fd" : "#e8f8ef", color: item.cat === "机器损耗" ? "#e74c3c" : item.cat === "运货运费" ? "#3498db" : "#2ecc71" }}>{item.cat}</span></td>
                  <td>{item.date}</td>
                  <td>¥{Number(item.amount).toFixed(2)}</td>
                  <td>{item.note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState title="筛选范围内没有支出记录" description="调整筛选条件或到各支出页面添加记录。" />}
      </Section>
    </div>
  );
}
