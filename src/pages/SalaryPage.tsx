import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash, Calculator, Users, Wallet, CaretDown, CaretRight } from "@phosphor-icons/react";
import { PageHeader, Section, Button, EmptyState, Modal } from "../components/ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

/** 翻袜 / 缝头 生产记录 */
type ProductionItem = {
  id: string;
  name: string;
  spec: "包" | "双";
  quantity: number;
  unitPrice: number;
  date?: string;
};

/** 定型生产记录（多一个颜色字段） */
type DingxingItem = ProductionItem & { color: string };

/** 额外工资项（奖金、补贴等），存于 sock-erp-salary */
type ExtraSalary = {
  id: string;
  name: string;
  amount: number;
  note: string;
  date: string;
};

/** 单个工序的汇总：双数量、包数量、金额 */
type ProcessSummary = { shuang: number; bao: number; amount: number };

type EmployeeRow = {
  name: string;
  fanwa: ProcessSummary;
  fengtou: ProcessSummary;
  dingxing: ProcessSummary;
  extra: number;
};

/** 每日产量明细行 */
type DailyRow = { date: string; process: string; spec: string; quantity: number; amount: number; color?: string };

const FANWA_KEY = "sock-erp-fanwa";
const FENGTOU_KEY = "sock-erp-fengtou";
const DINGXING_KEY = "sock-erp-dingxing";
const SALARY_KEY = "sock-erp-salary";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

function useLocalStorage<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => readJson(key, initial));
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* ignore */ }
  }, [key, state]);
  return [state, setState];
}

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptySummary(): ProcessSummary {
  return { shuang: 0, bao: 0, amount: 0 };
}

/** 员工工资合计 = 翻袜 + 缝头 + 定型 + 额外工资 */
function totalOf(e: EmployeeRow): number {
  return e.fanwa.amount + e.fengtou.amount + e.dingxing.amount + e.extra;
}

/** 数量按规格分别显示 */
function formatQty(s: ProcessSummary): string {
  const parts: string[] = [];
  if (s.shuang) parts.push(`${s.shuang}双`);
  if (s.bao) parts.push(`${s.bao}包`);
  return parts.length ? parts.join(" + ") : "-";
}

function ProcessCell({ summary }: { summary: ProcessSummary }) {
  return (
    <td>
      <div>{formatQty(summary)}</div>
      <div style={{ fontSize: 12, color: "#666" }}>¥{summary.amount.toFixed(2)}</div>
    </td>
  );
}

export function SalaryPage() {
  const fanwaItems = useState<ProductionItem[]>(() => readJson(FANWA_KEY, []))[0];
  const fengtouItems = useState<ProductionItem[]>(() => readJson(FENGTOU_KEY, []))[0];
  const dingxingItems = useState<DingxingItem[]>(() => readJson(DINGXING_KEY, []))[0];
  const [extras, setExtras] = useLocalStorage<ExtraSalary[]>(SALARY_KEY, []);

  const [modalOpen, setModalOpen] = useState(false);
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<ExtraSalary>({
    id: "", name: "", amount: 0, note: "",
    date: new Date().toISOString().slice(0, 10),
  });

  // 弹窗打开时自动聚焦姓名输入框
  useEffect(() => {
    if (modalOpen) setTimeout(() => nameInputRef.current?.focus(), 100);
  }, [modalOpen]);

  // 按姓名分组汇总三个工序 + 额外工资
  const employees = useMemo<EmployeeRow[]>(() => {
    const map = new Map<string, EmployeeRow>();
    const get = (name: string): EmployeeRow => {
      let row = map.get(name);
      if (!row) {
        row = { name, fanwa: emptySummary(), fengtou: emptySummary(), dingxing: emptySummary(), extra: 0 };
        map.set(name, row);
      }
      return row;
    };
    const push = (proc: "fanwa" | "fengtou" | "dingxing") =>
      (row: EmployeeRow) => row[proc];

    for (const it of fanwaItems) {
      const s = push("fanwa")(get(it.name));
      if (it.spec === "双") s.shuang += Number(it.quantity) || 0;
      else if (it.spec === "包") s.bao += Number(it.quantity) || 0;
      s.amount += (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
    }
    for (const it of fengtouItems) {
      const s = push("fengtou")(get(it.name));
      if (it.spec === "双") s.shuang += Number(it.quantity) || 0;
      else if (it.spec === "包") s.bao += Number(it.quantity) || 0;
      s.amount += (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
    }
    for (const it of dingxingItems) {
      const s = push("dingxing")(get(it.name));
      if (it.spec === "双") s.shuang += Number(it.quantity) || 0;
      else if (it.spec === "包") s.bao += Number(it.quantity) || 0;
      s.amount += (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
    }
    for (const ex of extras) {
      get(ex.name).extra += Number(ex.amount) || 0;
    }
    return [...map.values()].sort((a, b) => totalOf(b) - totalOf(a));
  }, [fanwaItems, fengtouItems, dingxingItems, extras]);

  const grandTotal = useMemo(() => employees.reduce((s, e) => s + totalOf(e), 0), [employees]);

  // 获取某员工的每日产量明细
  const dailyRecords = useMemo<DailyRow[]>(() => {
    if (!expandedName) return [];
    const rows: DailyRow[] = [];
    fanwaItems.filter((i) => i.name === expandedName).forEach((i) => {
      rows.push({ date: i.date || "无日期", process: "翻袜", spec: i.spec, quantity: Number(i.quantity) || 0, amount: (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0) });
    });
    fengtouItems.filter((i) => i.name === expandedName).forEach((i) => {
      rows.push({ date: i.date || "无日期", process: "缝头", spec: i.spec, quantity: Number(i.quantity) || 0, amount: (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0) });
    });
    dingxingItems.filter((i) => i.name === expandedName).forEach((i) => {
      rows.push({ date: i.date || "无日期", process: "定型", spec: i.spec, quantity: Number(i.quantity) || 0, amount: (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), color: i.color });
    });
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [expandedName, fanwaItems, fengtouItems, dingxingItems]);

  // 按日期分组
  const dailyByDate = useMemo(() => {
    const groups: Record<string, DailyRow[]> = {};
    dailyRecords.forEach((r) => {
      (groups[r.date] ??= []).push(r);
    });
    return groups;
  }, [dailyRecords]);

  const resetDraft = () => setDraft({ id: "", name: "", amount: 0, note: "", date: new Date().toISOString().slice(0, 10) });

  // 保存并继续（不关闭弹窗，清空姓名/金额/备注，保留日期，聚焦姓名框）
  const addExtra = () => {
    if (!draft.name.trim() || !draft.amount || draft.amount <= 0) return;
    setExtras((prev) => [...prev, { ...draft, name: draft.name.trim() }]);
    setDraft((prev) => ({ id: "", name: "", amount: 0, note: "", date: prev.date }));
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  // 保存并关闭
  const addExtraAndClose = () => {
    if (!draft.name.trim() || !draft.amount || draft.amount <= 0) return;
    setExtras((prev) => [...prev, { ...draft, name: draft.name.trim() }]);
    resetDraft();
    setModalOpen(false);
  };

  const removeExtra = (id: string) => setExtras((prev) => prev.filter((e) => e.id !== id));

  return (
    <div>
      <PageHeader
        icon={<ModuleArtwork module="fitness" />}
        eyebrow="人工成本"
        title="工资支出"
        description="关联翻袜、缝头、定型生产记录，按员工自动计算工资。点击姓名查看每人每天产量。"
        actions={<Button onClick={() => setModalOpen(true)}><Plus size={16} />添加额外工资</Button>}
      />

      <div className="expense-stats-grid">
        <div className="expense-stat-card" style={{ borderTop: "4px solid #3498db" }}>
          <span><Users size={16} /> 员工总数</span>
          <strong>{employees.length} 人</strong>
        </div>
        <div className="expense-stat-card" style={{ borderTop: "4px solid #2ecc71" }}>
          <span><Wallet size={16} /> 工资总额</span>
          <strong>¥{grandTotal.toFixed(2)}</strong>
        </div>
      </div>

      {employees.length ? (
        <>
        <Section title="员工工资卡片" description="按姓名显示每位员工的工资明细">
          <div className="prod-overview-grid">
            {employees.map((e) => (
              <div key={e.name} className="salary-card" style={{ cursor: "pointer" }} onClick={() => setExpandedName(expandedName === e.name ? null : e.name)}>
                <div className="salary-card-head">
                  <strong>{e.name}</strong>
                  <span className="salary-card-total">¥{totalOf(e).toFixed(0)}</span>
                </div>
                <div className="salary-card-body">
                  <div className="salary-card-row"><span>翻袜</span><span>{formatQty(e.fanwa)} · ¥{e.fanwa.amount.toFixed(0)}</span></div>
                  <div className="salary-card-row"><span>缝头</span><span>{formatQty(e.fengtou)} · ¥{e.fengtou.amount.toFixed(0)}</span></div>
                  <div className="salary-card-row"><span>定型</span><span>{formatQty(e.dingxing)} · ¥{e.dingxing.amount.toFixed(0)}</span></div>
                  {e.extra > 0 && <div className="salary-card-row"><span>额外</span><span>¥{e.extra.toFixed(0)}</span></div>}
                </div>
                <div className="salary-card-foot">
                  {expandedName === e.name ? <CaretDown size={14} /> : <CaretRight size={14} />}
                  <span>{expandedName === e.name ? "收起每日产量" : "查看每日产量"}</span>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="员工工资明细" description="按工资合计降序排列，点击姓名展开查看每日产量">
          <table className="prod-table">
            <thead>
              <tr><th>姓名</th><th>翻袜</th><th>缝头</th><th>定型</th><th>工资合计</th></tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <Fragment key={e.name}>
                  <tr style={{ cursor: "pointer" }} onClick={() => setExpandedName(expandedName === e.name ? null : e.name)}>
                    <td>
                      <strong style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {expandedName === e.name ? <CaretDown size={14} /> : <CaretRight size={14} />}
                        {e.name}
                      </strong>
                    </td>
                    <ProcessCell summary={e.fanwa} />
                    <ProcessCell summary={e.fengtou} />
                    <ProcessCell summary={e.dingxing} />
                    <td><strong>¥{totalOf(e).toFixed(2)}</strong></td>
                  </tr>
                  {expandedName === e.name && (
                    <tr>
                      <td colSpan={5} style={{ background: "#f9f9f9", padding: 0 }}>
                        <div style={{ padding: "12px 16px" }}>
                          <h4 style={{ margin: "0 0 8px", fontSize: 14, color: "#333" }}>{e.name} 的每日产量</h4>
                          {Object.keys(dailyByDate).length ? (
                            Object.entries(dailyByDate).map(([date, rows]) => {
                              const dayTotal = rows.reduce((s, r) => s + r.amount, 0);
                              const dayQty = rows.reduce((s, r) => s + r.quantity, 0);
                              return (
                                <div key={date} style={{ marginBottom: 12 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 4 }}>
                                    {date} — 共 {dayQty} {rows[0]?.spec || "包"}，¥{dayTotal.toFixed(2)}
                                  </div>
                                  <table className="prod-table" style={{ fontSize: 12 }}>
                                    <thead><tr><th>工序</th><th>规格</th><th>数量</th><th>金额</th>{rows.some(r => r.color) ? <th>颜色</th> : null}</tr></thead>
                                    <tbody>
                                      {rows.map((r, idx) => (
                                        <tr key={idx}>
                                          <td>{r.process}</td>
                                          <td>{r.spec}</td>
                                          <td>{r.quantity} {r.spec}</td>
                                          <td>¥{r.amount.toFixed(2)}</td>
                                          {rows.some(r => r.color) ? <td>{r.color || "-"}</td> : null}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              );
                            })
                          ) : <p style={{ color: "#999", fontSize: 13 }}>暂无产量记录</p>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          <div className="prod-summary prod-grand">
            <span><Calculator size={18} />工资总额：<strong>¥{grandTotal.toFixed(2)}</strong></span>
            <span>共 <strong>{employees.length}</strong> 名员工</span>
          </div>
        </Section>
        </>
      ) : (
        <EmptyState title="暂无生产记录" description="添加翻袜/缝头/定型记录后自动计算工资" />
      )}

      <Section title="额外工资项" description="奖金、补贴等手动录入的额外工资，姓名匹配时自动计入对应员工合计">
        {extras.length ? (
          <table className="prod-table">
            <thead>
              <tr><th>姓名</th><th>金额</th><th>备注</th><th>日期</th><th>操作</th></tr>
            </thead>
            <tbody>
              {[...extras].sort((a, b) => b.date.localeCompare(a.date)).map((ex) => (
                <tr key={ex.id}>
                  <td>{ex.name}</td>
                  <td><strong>¥{Number(ex.amount).toFixed(2)}</strong></td>
                  <td>{ex.note || "-"}</td>
                  <td>{ex.date}</td>
                  <td>
                    <button className="icon-button danger-text" title="删除" onClick={() => removeExtra(ex.id)}>
                      <Trash size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: "#999", margin: 0 }}>暂无额外工资，点击右上角「添加额外工资」录入奖金、补贴等。</p>
        )}
      </Section>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="添加额外工资" description="录入奖金、补贴等，姓名与生产记录匹配时自动计入员工工资。保存后可连续录入下一条。">
        <div className="form-grid">
          <label className="form-field">
            <span>姓名</span>
            <input ref={nameInputRef} placeholder="员工姓名" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") addExtra(); }} />
          </label>
          <label className="form-field">
            <span>金额</span>
            <input type="number" min="0" step="0.01" placeholder="金额(元)" value={draft.amount || ""} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) || 0 })} onKeyDown={(e) => { if (e.key === "Enter") addExtra(); }} />
          </label>
          <label className="form-field">
            <span>日期</span>
            <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          </label>
          <label className="form-field">
            <span>备注</span>
            <input placeholder="如：奖金、全勤补贴" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") addExtra(); }} />
          </label>
        </div>
        <footer className="modal-actions">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>取消</Button>
          <Button variant="secondary" onClick={addExtraAndClose}>保存并关闭</Button>
          <Button onClick={addExtra}>保存并继续</Button>
        </footer>
      </Modal>
    </div>
  );
}
