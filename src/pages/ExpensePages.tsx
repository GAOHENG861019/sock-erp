import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash, Calculator, Download, Pencil, X } from "@phosphor-icons/react";
import { PageHeader, Section, Button, EmptyState, Modal } from "../components/ui";
import { ModuleArtwork, type ModuleArtworkName } from "../components/ModuleArtwork";

export type ExpenseItem = {
  id: string;
  date: string;
  name: string;
  amount: number;
  note: string;
  photo?: string;
};

function useLocalStorage<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return initial;
      const parsed = JSON.parse(raw) as T;
      if (Array.isArray(initial) && !Array.isArray(parsed)) return initial;
      return parsed;
    } catch { return initial; }
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
  const [draft, setDraft] = useState<ExpenseItem>({ id: "", date: new Date().toISOString().slice(0, 10), name: "", amount: 0, note: "" });
  const [editing, setEditing] = useState<ExpenseItem | null>(null);
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const total = useMemo(() => items.reduce((s, i) => s + Number(i.amount || 0), 0), [items]);

  const addItem = () => {
    if (!draft.amount || draft.amount <= 0) return;
    setItems((prev) => [...prev, { ...draft, id: genId() }]);
    setDraft({ id: "", date: new Date().toISOString().slice(0, 10), name: "", amount: 0, note: "" });
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };
  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const saveEdit = () => {
    if (!editing) return;
    setItems((prev) => prev.map((i) => i.id === editing.id ? editing : i));
    setEditing(null);
  };

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
      <Section title="录入支出" description="填写日期、姓名、用途和金额，可上传凭证照片">
        <div className="production-input-row">
          <input className="prod-input" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          <input ref={nameInputRef} className="prod-input" placeholder="姓名" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={{ minWidth: 120 }} />
          <input className="prod-input" placeholder="用途" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} style={{ minWidth: 140 }} />
          <input className="prod-input prod-num" type="number" min="0" step="0.01" placeholder="金额" value={draft.amount || ""} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) || 0 })} />
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
            <thead><tr><th>日期</th><th>姓名</th><th>用途</th><th>金额</th><th>凭证</th><th>操作</th></tr></thead>
            <tbody>
              {[...items].sort((a, b) => b.date.localeCompare(a.date)).map((item) => (
                <tr key={item.id}>
                  <td>{item.date}</td>
                  <td>{item.name || "-"}</td>
                  <td>{item.note || "-"}</td>
                  <td><strong>¥{Number(item.amount).toFixed(2)}</strong></td>
                  <td>{item.photo ? <img src={item.photo} alt="凭证" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, cursor: "pointer" }} onClick={() => setViewPhoto(item.photo!)} /> : <span style={{ color: "#999", fontSize: 12 }}>无</span>}</td>
                  <td>
                    <button className="icon-button" title="编辑" onClick={() => setEditing({ ...item })}><Pencil size={16} /></button>
                    <button className="icon-button danger-text" title="删除" onClick={() => removeItem(item.id)}><Trash size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="prod-summary prod-grand"><span><Calculator size={18} />支出合计：<strong>¥{total.toFixed(2)}</strong></span></div>
        </Section>
      ) : <EmptyState title="还没有支出记录" description="在上方填写日期和金额后点击添加。" />}

      {/* 编辑弹窗 */}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title="编辑支出记录">
        {editing && (
          <div className="form-grid">
            <label className="form-field"><span>日期</span><input type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} /></label>
            <label className="form-field"><span>姓名</span><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
            <label className="form-field"><span>用途</span><input value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} /></label>
            <label className="form-field"><span>金额</span><input type="number" min="0" step="0.01" value={editing.amount || ""} onChange={(e) => setEditing({ ...editing, amount: Number(e.target.value) || 0 })} /></label>
          </div>
        )}
        <footer className="modal-actions">
          <Button variant="ghost" onClick={() => setEditing(null)}><X size={16} />取消</Button>
          <Button onClick={saveEdit}>保存修改</Button>
        </footer>
      </Modal>

      {/* 图片查看弹窗 */}
      <Modal open={viewPhoto !== null} onClose={() => setViewPhoto(null)} title="凭证照片">
        {viewPhoto && <img src={viewPhoto} alt="凭证" style={{ width: "100%", borderRadius: 8 }} />}
      </Modal>
    </div>
  );
}

export type IncomeItem = {
  id: string;
  date: string;
  customer: string;
  amount: number;
  note: string;
  photo?: string;
};

/** 货款收入页 */
export function PaymentIncomePage() {
  const [items, setItems] = useLocalStorage<IncomeItem[]>("sock-erp-payment-income", []);
  const [draft, setDraft] = useState<IncomeItem>({ id: "", date: new Date().toISOString().slice(0, 10), customer: "", amount: 0, note: "" });
  const customerInputRef = useRef<HTMLInputElement>(null);

  const total = useMemo(() => items.reduce((s, i) => s + Number(i.amount || 0), 0), [items]);

  const addItem = () => {
    if (!draft.amount || draft.amount <= 0) return;
    setItems((prev) => [...prev, { ...draft, id: genId() }]);
    setDraft({ id: "", date: new Date().toISOString().slice(0, 10), customer: "", amount: 0, note: "" });
    setTimeout(() => customerInputRef.current?.focus(), 0);
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
      <PageHeader icon={<ModuleArtwork module="dashboard" />} eyebrow="收入管理" title="货款收入" description="记录客户货款收入，支持客户名称、备注和凭证照片。" actions={<Button onClick={addItem}><Plus size={16} />添加收入</Button>} />
      <Section title="录入收入" description="填写日期、客户、金额和备注，可上传凭证照片">
        <div className="production-input-row">
          <input className="prod-input" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          <input ref={customerInputRef} className="prod-input" placeholder="客户名称" value={draft.customer} onChange={(e) => setDraft({ ...draft, customer: e.target.value })} style={{ minWidth: 140 }} />
          <input className="prod-input" placeholder="备注" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} style={{ minWidth: 140 }} />
          <input className="prod-input prod-num" type="number" min="0" step="0.01" placeholder="金额" value={draft.amount || ""} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) || 0 })} />
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
        <Section title="收入明细" description={`共 ${items.length} 条`}>
          <table className="prod-table">
            <thead><tr><th>日期</th><th>客户</th><th>备注</th><th>金额</th><th>凭证</th><th>操作</th></tr></thead>
            <tbody>
              {[...items].sort((a, b) => b.date.localeCompare(a.date)).map((item) => (
                <tr key={item.id}>
                  <td>{item.date}</td>
                  <td><strong>{item.customer || "-"}</strong></td>
                  <td>{item.note || "-"}</td>
                  <td><strong style={{ color: "#27ae60" }}>¥{Number(item.amount).toFixed(2)}</strong></td>
                  <td>{item.photo ? <img src={item.photo} alt="凭证" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }} /> : <span style={{ color: "#999", fontSize: 12 }}>无</span>}</td>
                  <td><button className="icon-button danger-text" title="删除" onClick={() => removeItem(item.id)}><Trash size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="prod-summary prod-grand"><span><Calculator size={18} />收入合计：<strong>¥{total.toFixed(2)}</strong></span></div>
        </Section>
      ) : <EmptyState title="还没有收入记录" description="在上方填写日期、客户和金额后点击添加。" />}
    </div>
  );
}

/** 支收统计页：支出与收入占比、时间段筛选、导出报表 */
export function ExpenseStatsPage() {
  const [machine] = useLocalStorage<ExpenseItem[]>("sock-erp-machine-loss", []);
  const [freight] = useLocalStorage<ExpenseItem[]>("sock-erp-freight", []);
  const [salaryExtras] = useLocalStorage<ExpenseItem[]>("sock-erp-salary", []);
  const [rawMaterials] = useLocalStorage<any[]>("sock-erp-raw-materials", []);
  const [paymentIncome] = useLocalStorage<IncomeItem[]>("sock-erp-payment-income", []);
  // 工资支出关联生产记录（翻袜/缝头/定型）+ 额外工资
  const [fanwa] = useLocalStorage<any[]>("sock-erp-fanwa", []);
  const [fengtou] = useLocalStorage<any[]>("sock-erp-fengtou", []);
  const [dingxing] = useLocalStorage<any[]>("sock-erp-dingxing", []);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const filterByDate = <T extends { date: string }>(items: T[]): T[] => {
    return items.filter((i) => {
      if (startDate && i.date < startDate) return false;
      if (endDate && i.date > endDate) return false;
      return true;
    });
  };

  const filterProductionByDate = (items: any[]) => {
    return items.filter((i) => {
      if (!i.date) return true; // 无日期的记录全部纳入
      if (startDate && i.date < startDate) return false;
      if (endDate && i.date > endDate) return false;
      return true;
    });
  };

  const mFiltered = filterByDate(machine);
  const fFiltered = filterByDate(freight);
  const sExtraFiltered = filterByDate(salaryExtras);
  // 生产记录按日期筛选
  const fanwaFiltered = filterProductionByDate(fanwa);
  const fengtouFiltered = filterProductionByDate(fengtou);
  const dingxingFiltered = filterProductionByDate(dingxing);
  // 工资总额 = 生产金额(翻袜+缝头+定型) + 额外工资
  const productionSalary = [...fanwaFiltered, ...fengtouFiltered, ...dingxingFiltered].reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0);
  const extraSalary = sExtraFiltered.reduce((s, i) => s + Number(i.amount || 0), 0);
  const sTotal = productionSalary + extraSalary;
  // 工资明细：生产记录 + 额外工资
  const salaryDetail = [
    ...fanwaFiltered.map((i) => ({ id: i.id, date: i.date || "无日期", amount: (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), note: `翻袜-${i.name}`, cat: "工资支出" })),
    ...fengtouFiltered.map((i) => ({ id: i.id, date: i.date || "无日期", amount: (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), note: `缝头-${i.name}`, cat: "工资支出" })),
    ...dingxingFiltered.map((i) => ({ id: i.id, date: i.date || "无日期", amount: (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), note: `定型-${i.name}(${i.color || ""})`, cat: "工资支出" })),
    ...sExtraFiltered.map((i) => ({ ...i, cat: "工资支出" })),
  ];
  // 原材料无日期字段，全部纳入
  const rFiltered = rawMaterials;

  const mTotal = mFiltered.reduce((s, i) => s + Number(i.amount || 0), 0);
  const fTotal = fFiltered.reduce((s, i) => s + Number(i.amount || 0), 0);
  const rTotal = rFiltered.reduce((s, i) => s + Number(i.amount || 0), 0);
  const grandTotal = mTotal + fTotal + sTotal + rTotal;
  // 货款收入
  const incomeFiltered = filterByDate(paymentIncome);
  const incomeTotal = incomeFiltered.reduce((s, i) => s + Number(i.amount || 0), 0);
  const netIncome = incomeTotal - grandTotal;

  const pct = (v: number) => grandTotal > 0 ? ((v / grandTotal) * 100).toFixed(1) : "0.0";

  const exportCSV = () => {
    const rows = [
      ["类别", "日期", "用途/客户", "金额"],
      ...mFiltered.map((i) => ["机器损耗", i.date, i.note, i.amount]),
      ...fFiltered.map((i) => ["运货运费", i.date, i.note, i.amount]),
      ...salaryDetail.map((i) => ["工资支出", i.date, i.note, i.amount]),
      ...rFiltered.map((i) => ["原材料采购", i.date || "无日期", `${i.name} ${i.spec || ""}`.trim(), i.amount]),
      ...incomeFiltered.map((i) => ["货款收入", i.date, i.customer, i.amount]),
      [],
      ["汇总", "", "", ""],
      ["机器损耗", "", mTotal.toFixed(2), `${pct(mTotal)}%`],
      ["运货运费", "", fTotal.toFixed(2), `${pct(fTotal)}%`],
      ["工资支出", "", sTotal.toFixed(2), `${pct(sTotal)}%`],
      ["原材料采购", "", rTotal.toFixed(2), `${pct(rTotal)}%`],
      ["支出总计", "", grandTotal.toFixed(2), "100%"],
      ["货款收入", "", incomeTotal.toFixed(2), ""],
      ["净收入", "", netIncome.toFixed(2), ""],
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `支收统计_${startDate || "全部"}_${endDate || "全部"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const categories = [
    { name: "机器损耗", total: mTotal, color: "#e74c3c", route: "/entertainment" },
    { name: "运货运费", total: fTotal, color: "#3498db", route: "/sales-order" },
    { name: "工资支出", total: sTotal, color: "#2ecc71", route: "/salary" },
    { name: "原材料采购", total: rTotal, color: "#f39c12", route: "/fitness" },
  ];

  return (
    <div>
      <PageHeader icon={<ModuleArtwork module="dashboard" />} eyebrow="财务统计" title="支收统计" description="支出与收入占比分析，支持时间段筛选和导出报表。" actions={<Button onClick={exportCSV}><Download size={16} />导出CSV</Button>} />
      <Section title="筛选条件" description="按日期范围筛选收支记录">
        <div className="production-input-row">
          <span style={{ fontSize: 14, color: "#666" }}>开始日期</span>
          <input className="prod-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <span style={{ fontSize: 14, color: "#666" }}>结束日期</span>
          <input className="prod-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          {(startDate || endDate) && <Button variant="ghost" size="sm" onClick={() => { setStartDate(""); setEndDate(""); }}>清除筛选</Button>}
        </div>
      </Section>
      <Section title="收支汇总" description="筛选范围内的收支情况">
        <div className="expense-stats-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="expense-stat-card" style={{ borderTop: "4px solid #27ae60" }}>
            <span>货款收入</span>
            <strong style={{ color: "#27ae60" }}>¥{incomeTotal.toFixed(2)}</strong>
            <small>收入总额</small>
          </div>
          <div className="expense-stat-card" style={{ borderTop: "4px solid #e74c3c" }}>
            <span>支出总计</span>
            <strong style={{ color: "#e74c3c" }}>¥{grandTotal.toFixed(2)}</strong>
            <small>四类支出合计</small>
          </div>
          <div className="expense-stat-card" style={{ borderTop: `4px solid ${netIncome >= 0 ? "#27ae60" : "#e74c3c"}` }}>
            <span>净收入</span>
            <strong style={{ color: netIncome >= 0 ? "#27ae60" : "#e74c3c" }}>¥{netIncome.toFixed(2)}</strong>
            <small>{netIncome >= 0 ? "盈利" : "亏损"}</small>
          </div>
        </div>
      </Section>
      <Section title="四类支出占比" description={`筛选范围内总支出 ¥${grandTotal.toFixed(2)}`}>
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
          <span>原材料 <strong style={{ color: "#f39c12" }}>{pct(rTotal)}%</strong></span>
        </div>
      </Section>
      <Section title="收支明细汇总" description="筛选范围内的所有收支记录">
        {(grandTotal > 0 || incomeTotal > 0) ? (
          <table className="prod-table">
            <thead><tr><th>类别</th><th>日期</th><th>用途/客户</th><th>金额</th></tr></thead>
            <tbody>
              {[...mFiltered.map((i) => ({ ...i, cat: "机器损耗" })), ...fFiltered.map((i) => ({ ...i, cat: "运货运费" })), ...salaryDetail.map((i) => ({ ...i, cat: "工资支出" })), ...rFiltered.map((i) => ({ id: i.id, date: i.date || "无日期", amount: i.amount, note: `${i.name} ${i.spec || ""}`.trim(), cat: "原材料采购" })), ...incomeFiltered.map((i) => ({ id: i.id, date: i.date, amount: i.amount, note: i.customer, cat: "货款收入" }))].sort((a, b) => String(b.date).localeCompare(String(a.date))).map((item) => (
                <tr key={item.id}>
                  <td><span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 12, background: item.cat === "货款收入" ? "#e8f8ef" : item.cat === "机器损耗" ? "#fde8e8" : item.cat === "运货运费" ? "#e8f4fd" : item.cat === "原材料采购" ? "#fef5e7" : "#e8f8ef", color: item.cat === "货款收入" ? "#27ae60" : item.cat === "机器损耗" ? "#e74c3c" : item.cat === "运货运费" ? "#3498db" : item.cat === "原材料采购" ? "#f39c12" : "#2ecc71" }}>{item.cat}</span></td>
                  <td>{item.date}</td>
                  <td>{item.note || "-"}</td>
                  <td style={{ color: item.cat === "货款收入" ? "#27ae60" : "#333", fontWeight: 600 }}>{item.cat === "货款收入" ? "+" : ""}¥{Number(item.amount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState title="筛选范围内没有收支记录" description="调整筛选条件或到各页面添加记录。" />}
      </Section>
    </div>
  );
}
