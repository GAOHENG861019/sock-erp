import { useEffect, useMemo, useState } from "react";
import { Plus, Trash, Calculator, Users, Wallet } from "@phosphor-icons/react";
import { PageHeader, Section, Button, EmptyState, Modal } from "../components/ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

/** 翻袜 / 缝头 生产记录 */
type ProductionItem = {
  id: string;
  name: string;
  spec: "包" | "双";
  quantity: number;
  unitPrice: number;
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

const FANWA_KEY = "sock-erp-fanwa";
const FENGTOU_KEY = "sock-erp-fengtou";
const DINGXING_KEY = "sock-erp-dingxing";
const SALARY_KEY = "sock-erp-salary";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
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

/** 数量按规格分别显示：只有双 "100双"，只有包 "50包"，都有 "100双 + 50包"，都没有 "-" */
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

/**
 * 工资支出页：
 * 1. 读取翻袜 / 缝头 / 定型三个生产数据源
 * 2. 按员工姓名分组，分别汇总三个工序的数量(双/包)与金额
 * 3. 员工工资合计 = 三工序金额 + 该员工名下额外工资
 * 4. 额外工资项（奖金、补贴）手动录入，存于 sock-erp-salary
 */
export function SalaryPage() {
  // 三个生产数据源在本页只读，挂载时读取一次
  const fanwaItems = useState<ProductionItem[]>(() => readJson(FANWA_KEY, []))[0];
  const fengtouItems = useState<ProductionItem[]>(() => readJson(FENGTOU_KEY, []))[0];
  const dingxingItems = useState<DingxingItem[]>(() => readJson(DINGXING_KEY, []))[0];
  // 额外工资项可增删，需要持久化
  const [extras, setExtras] = useLocalStorage<ExtraSalary[]>(SALARY_KEY, []);

  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<ExtraSalary>({
    id: "", name: "", amount: 0, note: "",
    date: new Date().toISOString().slice(0, 10),
  });

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
    // 额外工资计入同名员工；无同名生产记录的员工也单独成行
    for (const ex of extras) {
      get(ex.name).extra += Number(ex.amount) || 0;
    }
    return [...map.values()].sort((a, b) => totalOf(b) - totalOf(a));
  }, [fanwaItems, fengtouItems, dingxingItems, extras]);

  const grandTotal = useMemo(() => employees.reduce((s, e) => s + totalOf(e), 0), [employees]);

  const resetDraft = () => setDraft({ id: "", name: "", amount: 0, note: "", date: new Date().toISOString().slice(0, 10) });

  const addExtra = () => {
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
        description="关联翻袜、缝头、定型生产记录，按员工自动计算工资。"
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
        <Section title="员工工资明细" description="按工资合计降序排列，三工序数量按双/包分别汇总">
          <table className="prod-table">
            <thead>
              <tr><th>姓名</th><th>翻袜</th><th>缝头</th><th>定型</th><th>工资合计</th></tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.name}>
                  <td><strong>{e.name}</strong></td>
                  <ProcessCell summary={e.fanwa} />
                  <ProcessCell summary={e.fengtou} />
                  <ProcessCell summary={e.dingxing} />
                  <td><strong>¥{totalOf(e).toFixed(2)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="prod-summary prod-grand">
            <span><Calculator size={18} />工资总额：<strong>¥{grandTotal.toFixed(2)}</strong></span>
            <span>共 <strong>{employees.length}</strong> 名员工</span>
          </div>
        </Section>
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="添加额外工资" description="录入奖金、补贴等，姓名与生产记录匹配时自动计入员工工资">
        <div className="form-grid">
          <label className="form-field">
            <span>姓名</span>
            <input placeholder="员工姓名" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="form-field">
            <span>金额</span>
            <input type="number" min="0" step="0.01" placeholder="金额(元)" value={draft.amount || ""} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) || 0 })} />
          </label>
          <label className="form-field">
            <span>日期</span>
            <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          </label>
          <label className="form-field">
            <span>备注</span>
            <input placeholder="如：奖金、全勤补贴" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          </label>
        </div>
        <footer className="modal-actions">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>取消</Button>
          <Button onClick={addExtra}>保存</Button>
        </footer>
      </Modal>
    </div>
  );
}
