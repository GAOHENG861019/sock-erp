import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash, Package, Cube, Calculator } from "@phosphor-icons/react";
import { PageHeader, Section, Button, Modal, ConfirmDialog, EmptyState, Badge } from "../components/ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

type TabKey = "finished" | "material";

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

  // 表单状态
  const [formLinkedId, setFormLinkedId] = useState("");
  const [formQuantity, setFormQuantity] = useState("");
  const [formNote, setFormNote] = useState("");

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

  const totals = useMemo(() => {
    const totalQty = currentList.reduce((s, i) => s + (i.quantity || 0), 0);
    const totalAmount = currentList.reduce((s, i) => {
      const price = getUnitPrice(activeTab, i.linkedId);
      return s + (i.quantity || 0) * price;
    }, 0);
    return { totalQty, totalAmount };
  }, [currentList, activeTab, dingxingList, rawMaterialList]);

  function updateList(tab: TabKey, list: InventoryItem[]) {
    if (tab === "finished") setFinishedList(list);
    else setMaterialList(list);
  }

  function openAdd() {
    setEditing(null);
    setFormLinkedId("");
    setFormQuantity("");
    setFormNote("");
    setModalOpen(true);
  }

  function openEdit(item: InventoryItem) {
    setEditing(item);
    setFormLinkedId(item.linkedId);
    setFormQuantity(String(item.quantity));
    setFormNote(item.note);
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
      if (idx >= 0) list[idx] = { ...list[idx], linkedId: formLinkedId, quantity, note };
    } else {
      list.push({ id: genId(), linkedId: formLinkedId, quantity, note });
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
  const options = isFinished
    ? dingxingList.map((d) => ({ value: d.id, label: `${d.color ?? ""} - ${d.spec ?? ""} - ${d.name ?? ""}` }))
    : rawMaterialList.map((r) => ({ value: r.id, label: `${r.name ?? ""} - ${r.spec ?? ""}` }));

  return (
    <>
      <PageHeader
        icon={<ModuleArtwork module="consulting" />}
        eyebrow="仓库与商品"
        title="仓库管理"
        description="管理成品库存和原材料库存(公斤)，支持关联定型和原材料采购数据。"
        actions={
          <Button onClick={openAdd}><Plus size={17} />{isFinished ? "添加成品库存" : "添加原材料库存"}</Button>
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

      <Section
        title={isFinished ? "成品库存" : "原材料库存"}
        description={`共 ${currentList.length} 条记录，单价从${isFinished ? "定型" : "原材料采购"}记录自动读取`}
      >
        {currentList.length === 0 ? (
          <EmptyState
            title={isFinished ? "暂无成品库存" : "暂无原材料库存"}
            description={isFinished ? "点击添加成品库存" : "点击添加原材料库存"}
          />
        ) : (
          <>
            <table className="prod-table">
              <thead>
                <tr>
                  <th>{isFinished ? "关联成品" : "关联原材料"}</th>
                  <th>库存数量(公斤)</th>
                  <th>单价(元/公斤)</th>
                  <th>库存金额</th>
                  <th>备注</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {currentList.map((item) => {
                  const price = getUnitPrice(activeTab, item.linkedId);
                  const amount = (item.quantity || 0) * price;
                  return (
                    <tr key={item.id}>
                      <td><strong>{getLinkedLabel(activeTab, item.linkedId)}</strong></td>
                      <td>{item.quantity} 公斤</td>
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
            <div className="prod-summary prod-grand">
              <span><Calculator size={18} />{isFinished ? "成品总数量" : "原材料总重量"}：<strong>{totals.totalQty} 公斤</strong></span>
              <span>{isFinished ? "成品总金额" : "原材料总金额"}：<strong>¥{totals.totalAmount.toFixed(2)}</strong></span>
            </div>
          </>
        )}
      </Section>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        title={editing ? `编辑${isFinished ? "成品" : "原材料"}库存` : `添加${isFinished ? "成品" : "原材料"}库存`}
        description={isFinished ? "选择关联的定型记录，填写库存数量(公斤)。" : "选择关联的原材料记录，填写库存重量(公斤)。"}
      >
        <form className="entity-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="form-field">
              <span>{isFinished ? "关联定型" : "关联原材料"}<em>必填</em></span>
              <select value={formLinkedId} onChange={(e) => setFormLinkedId(e.target.value)} required>
                <option value="">请选择</option>
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="form-field">
              <span>库存数量(公斤)<em>必填</em></span>
              <input type="number" step="0.01" value={formQuantity} onChange={(e) => setFormQuantity(e.target.value)} placeholder="0" required />
            </label>
            <label className="form-field">
              <span>备注</span>
              <input type="text" value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder="可选" />
            </label>
          </div>
          <footer className="modal-actions">
            <Button type="button" variant="ghost" onClick={() => { setModalOpen(false); setEditing(null); }}>取消</Button>
            <Button type="submit">{editing ? "保存修改" : isFinished ? "添加成品库存" : "添加原材料库存"}</Button>
          </footer>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除库存记录"
        description={`确定要删除这条${isFinished ? "成品" : "原材料"}库存记录吗？此操作不可撤销。`}
        confirmLabel="删除"
        danger
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
