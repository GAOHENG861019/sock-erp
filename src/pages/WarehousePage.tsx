import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash, Package, Cube, Calculator, ArrowDown, ArrowUp } from "@phosphor-icons/react";
import { PageHeader, Section, Button, Modal, ConfirmDialog, EmptyState, Badge } from "../components/ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

type TabKey = "finished" | "material";
type TxnType = "in" | "out";

type DingxingRecord = {
  id: string;
  name: string;
  color: string;
  spec: string;
  quantity?: number;
  unitPrice?: number;
};

type RawMaterialRecord = {
  id: string;
  name: string;
  spec: string;
  weight?: number;
  unitPrice?: number;
  amount?: number;
};

type InventoryItem = {
  id: string;
  linkedId: string;
  quantity: number;
  note: string;
  type: TxnType;
  date: string;
};

const FINISHED_KEY = "sock-erp-finished-inventory";
const MATERIAL_KEY = "sock-erp-material-inventory";
const DINGXING_KEY = "sock-erp-dingxing";
const RAW_MATERIAL_KEY = "sock-erp-raw-materials";

function readJsonArray<T = any>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function useLocalStorage<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [key, state]);
  return [state, setState];
}

function genId() {
  return `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function WarehousePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("finished");
  const [finishedList, setFinishedList] = useLocalStorage<InventoryItem[]>(FINISHED_KEY, []);
  const [materialList, setMaterialList] = useLocalStorage<InventoryItem[]>(MATERIAL_KEY, []);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
  const [txnType, setTxnType] = useState<TxnType>("in");

  const [formLinkedId, setFormLinkedId] = useState("");
  const [formQuantity, setFormQuantity] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));

  const dingxingList = useMemo(() => readJsonArray<DingxingRecord>(DINGXING_KEY), []);
  const rawMaterialList = useMemo(() => readJsonArray<RawMaterialRecord>(RAW_MATERIAL_KEY), []);

  const currentList = activeTab === "finished" ? finishedList : materialList;

  function getUnitPrice(tab: TabKey, linkedId: string): number {
    if (tab === "finished") {
      const d = dingxingList.find((x) => x.id === linkedId);
      return d?.unitPrice ?? 0;
    }
    const r = rawMaterialList.find((x) => x.id === linkedId);
    return r?.unitPrice ?? 0;
  }

  function getLinkedLabel(tab: TabKey, linkedId: string): string {
    if (tab === "finished") {
      const d = dingxingList.find((x) => x.id === linkedId);
      return d ? `${d.color ?? ""} - ${d.spec ?? ""} - ${d.name ?? ""}` : "关联已删除";
    }
    const r = rawMaterialList.find((x) => x.id === linkedId);
    return r ? `${r.name ?? ""} - ${r.spec ?? ""}` : "关联已删除";
  }

  function getColor(tab: TabKey, linkedId: string): string {
    if (tab === "finished") {
      const d = dingxingList.find((x) => x.id === linkedId);
      return d?.color || "未分类";
    }
    const r = rawMaterialList.find((x) => x.id === linkedId);
    return r?.name || "未分类";
  }

  function getSpec(tab: TabKey, linkedId: string): string {
    if (tab === "finished") {
      const d = dingxingList.find((x) => x.id === linkedId);
      return d?.spec || "未分类";
    }
    const r = rawMaterialList.find((x) => x.id === linkedId);
    return r?.spec || "未分类";
  }

  // 按颜色+规格计算当前库存余量
  const balanceByColorSpec = useMemo(() => {
    const groups: Record<string, number> = {};
    currentList.forEach((item) => {
      const color = getColor(activeTab, item.linkedId);
      const spec = getSpec(activeTab, item.linkedId);
      const key = `${color}|${spec}`;
      const qty = Number(item.quantity || 0);
      if (item.type === "out") {
        groups[key] = (groups[key] || 0) - qty;
      } else {
        groups[key] = (groups[key] || 0) + qty;
      }
    });
    return groups;
  }, [currentList, activeTab, dingxingList, rawMaterialList]);

  const totalBalance = Object.values(balanceByColorSpec).reduce((s, v) => s + v, 0);

  function updateList(tab: TabKey, list: InventoryItem[]) {
    if (tab === "finished") setFinishedList(list);
    else setMaterialList(list);
  }

  function openAdd(type: TxnType = "in") {
    setEditing(null);
    setTxnType(type);
    setFormLinkedId("");
    setFormQuantity("");
    setFormNote("");
    setFormDate(new Date().toISOString().slice(0, 10));
    setModalOpen(true);
  }

  function openEdit(item: InventoryItem) {
    setEditing(item);
    setTxnType(item.type || "in");
    setFormLinkedId(item.linkedId);
    setFormQuantity(String(item.quantity));
    setFormNote(item.note);
    setFormDate(item.date || new Date().toISOString().slice(0, 10));
    setModalOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formLinkedId) return;
    const list = activeTab === "finished" ? [...finishedList] : [...materialList];
    const quantity = Number(formQuantity) || 0;
    const note = formNote.trim();
    if (editing) {
      const idx = list.findIndex((i) => i.id === editing.id);
      if (idx >= 0) list[idx] = { ...list[idx], linkedId: formLinkedId, quantity, note, type: txnType, date: formDate };
    } else {
      list.push({ id: genId(), linkedId: formLinkedId, quantity, note, type: txnType, date: formDate });
    }
    updateList(activeTab, list);
    setModalOpen(false);
    setEditing(null);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const list = (activeTab === "finished" ? finishedList : materialList).filter((i) => i.id !== deleteTarget.id);
    updateList(activeTab, list);
    setDeleteTarget(null);
  }

  const isFinished = activeTab === "finished";
  const unit = isFinished ? "包" : "公斤";
  const options = isFinished
    ? dingxingList.map((d) => ({ value: d.id, label: `${d.color ?? ""} - ${d.spec ?? ""} - ${d.name ?? ""}` }))
    : rawMaterialList.map((r) => ({ value: r.id, label: `${r.name ?? ""} - ${r.spec ?? ""}` }));

  return (
    <>
      <PageHeader
        icon={<ModuleArtwork module="consulting" />}
        eyebrow="仓库与商品"
        title="仓库管理"
        description="管理成品库存(包)和原材料库存(公斤)，支持入库出库，关联定型和原材料采购数据。"
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={() => openAdd("in")}><ArrowDown size={17} />入库</Button>
            <Button variant="secondary" onClick={() => openAdd("out")}><ArrowUp size={17} />出库</Button>
          </div>
        }
      />

      <div className="category-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === "finished"}
          className={activeTab === "finished" ? "category-tab active" : "category-tab"}
          onClick={() => setActiveTab("finished")}
        >
          <Package size={16} />
          成品库存
          <Badge tone="neutral">{finishedList.length}</Badge>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "material"}
          className={activeTab === "material" ? "category-tab active" : "category-tab"}
          onClick={() => setActiveTab("material")}
        >
          <Cube size={16} />
          原材料库存
          <Badge tone="neutral">{materialList.length}</Badge>
        </button>
      </div>

      {/* 库存余量按颜色+规格汇总 */}
      <Section title={isFinished ? "成品库存余量（按颜色和规格）" : "原材料库存余量（按名称和规格）"} description="入库减出库后的当前余量">
        {Object.keys(balanceByColorSpec).length ? (
          <div className="prod-overview-grid">
            {Object.entries(balanceByColorSpec).map(([key, qty]) => {
              const [color, spec] = key.split("|");
              return (
                <div key={key} className="prod-overview-card">
                  <div className="pov-icon" style={{ background: isFinished ? "#3498db20" : "#f39c1220", color: isFinished ? "#3498db" : "#f39c12" }}>
                    {isFinished ? <Package size={22} /> : <Cube size={22} />}
                  </div>
                  <span>{color}</span>
                  <strong>{qty}{unit}</strong>
                  <small>规格：{spec}</small>
                </div>
              );
            })}
          </div>
        ) : <p className="quiet-line">暂无库存记录</p>}
        <div className="prod-summary prod-grand">
          <span><Calculator size={18} />当前总余量：<strong>{totalBalance} {unit}</strong></span>
        </div>
      </Section>

      <Section
        title={isFinished ? "出入库记录" : "出入库记录"}
        description={`共 ${currentList.length} 条记录，单价从${isFinished ? "定型" : "原材料采购"}记录自动读取`}
      >
        {currentList.length === 0 ? (
          <EmptyState
            title={isFinished ? "暂无成品库存记录" : "暂无原材料库存记录"}
            description={isFinished ? "点击入库或出库添加记录" : "点击入库或出库添加记录"}
          />
        ) : (
          <>
            <table className="prod-table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>类型</th>
                  <th>{isFinished ? "颜色" : "名称"}</th>
                  <th>规格</th>
                  <th>{isFinished ? "姓名" : "关联原材料"}</th>
                  <th>数量({unit})</th>
                  <th>单价(元/{unit})</th>
                  <th>金额</th>
                  <th>备注</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {[...currentList].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((item) => {
                  const price = getUnitPrice(activeTab, item.linkedId);
                  const amount = (item.quantity || 0) * price;
                  const isOut = item.type === "out";
                  const color = getColor(activeTab, item.linkedId);
                  const spec = getSpec(activeTab, item.linkedId);
                  const linked = activeTab === "finished"
                    ? (dingxingList.find((x) => x.id === item.linkedId)?.name || "-")
                    : getLinkedLabel(activeTab, item.linkedId);
                  return (
                    <tr key={item.id}>
                      <td>{item.date || "-"}</td>
                      <td>
                        <Badge tone={isOut ? "danger" : "success"}>
                          {isOut ? "出库" : "入库"}
                        </Badge>
                      </td>
                      <td><strong>{color}</strong></td>
                      <td>{spec}</td>
                      <td>{linked}</td>
                      <td style={{ color: isOut ? "#e74c3c" : "#27ae60" }}>
                        {isOut ? "-" : "+"}{item.quantity} {unit}
                      </td>
                      <td>¥{price.toFixed(2)}</td>
                      <td>¥{amount.toFixed(2)}</td>
                      <td>{item.note || "-"}</td>
                      <td>
                        <div className="row-actions">
                          <button className="icon-btn" onClick={() => openEdit(item)} aria-label="编辑"><Pencil size={15} /></button>
                          <button className="icon-btn danger" onClick={() => setDeleteTarget(item)} aria-label="删除"><Trash size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </Section>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        title={editing ? `编辑${isFinished ? "成品" : "原材料"}${txnType === "out" ? "出库" : "入库"}` : `${txnType === "out" ? "出库" : "入库"}${isFinished ? "成品" : "原材料"}`}
        description={isFinished ? "选择关联的定型记录，填写数量(包)。" : "选择关联的原材料记录，填写重量(公斤)。"}
      >
        <form className="entity-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="form-field">
              <span>类型<em>必填</em></span>
              <select value={txnType} onChange={(e) => setTxnType(e.target.value as TxnType)}>
                <option value="in">入库</option>
                <option value="out">出库</option>
              </select>
            </label>
            <label className="form-field">
              <span>日期</span>
              <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
            </label>
            <label className="form-field">
              <span>{isFinished ? "关联定型" : "关联原材料"}<em>必填</em></span>
              <select value={formLinkedId} onChange={(e) => setFormLinkedId(e.target.value)} required>
                <option value="">请选择</option>
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="form-field">
              <span>数量({unit})<em>必填</em></span>
              <input type="number" step="0.01" min="0" value={formQuantity} onChange={(e) => setFormQuantity(e.target.value)} placeholder="0" required />
            </label>
            <label className="form-field">
              <span>备注</span>
              <input type="text" value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder="可选" />
            </label>
          </div>
          <footer className="modal-actions">
            <Button type="button" variant="ghost" onClick={() => { setModalOpen(false); setEditing(null); }}>取消</Button>
            <Button type="submit">{editing ? "保存修改" : txnType === "out" ? "确认出库" : "确认入库"}</Button>
          </footer>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除库存记录"
        description={`确定要删除这条${isFinished ? "成品" : "原材料"}${deleteTarget?.type === "out" ? "出库" : "入库"}记录吗？此操作不可撤销。`}
        confirmLabel="删除"
        danger
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
