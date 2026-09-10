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
  packages?: number;
  weightKg?: number;
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
  const [formPackages, setFormPackages] = useState("");
  const [formWeightKg, setFormWeightKg] = useState("");
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

  function getItemPackages(tab: TabKey, item: InventoryItem): number {
    if (tab === "finished") return Number(item.quantity || 0);
    return Number(item.packages || 0);
  }

  function getItemWeightKg(tab: TabKey, item: InventoryItem): number {
    if (tab === "finished") return Number(item.weightKg || 0);
    return Number(item.quantity || 0);
  }

  // 按颜色+规格计算当前库存余量（包数和公斤数）
  // 成品：定型自动入库，余量 = 定型总数 - 出库数
  // 原材料：余量 = 入库数 - 出库数
  const balanceByColorSpec = useMemo(() => {
    const groups: Record<string, { packages: number; weightKg: number }> = {};

    if (activeTab === "finished") {
      // 成品：包数从定型自动入库，公斤数从入库减出库（定型无重量数据）
      dingxingList.forEach((d) => {
        const color = d.color || "未分类";
        const spec = d.spec || "未分类";
        const key = `${color}|${spec}`;
        if (!groups[key]) groups[key] = { packages: 0, weightKg: 0 };
        groups[key].packages += Number(d.quantity || 0);
      });
      // 出入库记录：包数只减出库，公斤数入库减出库
      currentList.forEach((item) => {
        const color = getColor(activeTab, item.linkedId);
        const spec = getSpec(activeTab, item.linkedId);
        const key = `${color}|${spec}`;
        const pkgs = getItemPackages(activeTab, item);
        const kg = getItemWeightKg(activeTab, item);
        if (!groups[key]) groups[key] = { packages: 0, weightKg: 0 };
        if (item.type === "out") {
          groups[key].packages -= pkgs;
          groups[key].weightKg -= kg;
        } else {
          groups[key].weightKg += kg;
        }
      });
    } else {
      // 原材料：入库 - 出库
      currentList.forEach((item) => {
        const color = getColor(activeTab, item.linkedId);
        const spec = getSpec(activeTab, item.linkedId);
        const key = `${color}|${spec}`;
        const pkgs = getItemPackages(activeTab, item);
        const kg = getItemWeightKg(activeTab, item);
        const sign = item.type === "out" ? -1 : 1;
        if (!groups[key]) groups[key] = { packages: 0, weightKg: 0 };
        groups[key].packages += sign * pkgs;
        groups[key].weightKg += sign * kg;
      });
    }
    return groups;
  }, [currentList, activeTab, dingxingList, rawMaterialList]);

  // 成品按颜色汇总（合并不同规格）
  const balanceByColor = useMemo(() => {
    const groups: Record<string, { packages: number; weightKg: number; specs: string[] }> = {};
    Object.entries(balanceByColorSpec).forEach(([key, val]) => {
      const [color, spec] = key.split("|");
      if (!groups[color]) groups[color] = { packages: 0, weightKg: 0, specs: [] };
      groups[color].packages += val.packages;
      groups[color].weightKg += val.weightKg;
      if (val.packages !== 0 || val.weightKg !== 0) groups[color].specs.push(spec);
    });
    return groups;
  }, [balanceByColorSpec]);

  const totalPackages = Object.values(balanceByColorSpec).reduce((s, v) => s + v.packages, 0);
  const totalWeightKg = Object.values(balanceByColorSpec).reduce((s, v) => s + v.weightKg, 0);

  function updateList(tab: TabKey, list: InventoryItem[]) {
    if (tab === "finished") setFinishedList(list);
    else setMaterialList(list);
  }

  function openAdd(type: TxnType = "in") {
    setEditing(null);
    setTxnType(type);
    setFormLinkedId("");
    setFormQuantity("");
    setFormPackages("");
    setFormWeightKg("");
    setFormNote("");
    setFormDate(new Date().toISOString().slice(0, 10));
    setModalOpen(true);
  }

  function openEdit(item: InventoryItem) {
    setEditing(item);
    setTxnType(item.type || "in");
    setFormLinkedId(item.linkedId);
    setFormQuantity(String(item.quantity));
    setFormPackages(String(item.packages ?? ""));
    setFormWeightKg(String(item.weightKg ?? ""));
    setFormNote(item.note);
    setFormDate(item.date || new Date().toISOString().slice(0, 10));
    setModalOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formLinkedId) return;
    const list = activeTab === "finished" ? [...finishedList] : [...materialList];
    const quantity = Number(formQuantity) || 0;
    const packages = Number(formPackages) || 0;
    const weightKg = Number(formWeightKg) || 0;
    const note = formNote.trim();
    if (editing) {
      const idx = list.findIndex((i) => i.id === editing.id);
      if (idx >= 0) list[idx] = { ...list[idx], linkedId: formLinkedId, quantity, packages, weightKg, note, type: txnType, date: formDate };
      updateList(activeTab, list);
      setModalOpen(false);
      setEditing(null);
    } else {
      list.push({ id: genId(), linkedId: formLinkedId, quantity, packages, weightKg, note, type: txnType, date: formDate });
      updateList(activeTab, list);
      // 连续输入：重置表单，保持弹窗打开
      setFormLinkedId("");
      setFormQuantity("");
      setFormPackages("");
      setFormWeightKg("");
      setFormNote("");
    }
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
        description="成品库存关联定型自动入库(包)，原材料库存(公斤)支持入库出库，关联定型和原材料采购数据。"
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            {activeTab !== "finished" && <Button onClick={() => openAdd("in")}><ArrowDown size={17} />入库</Button>}
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

      {/* 库存余量：成品按颜色汇总，原材料按名称+规格 */}
      <Section title={isFinished ? "成品库存余量（按颜色）" : "原材料库存余量（按名称和规格）"} description="入库减出库后的当前余量，上面包数下面公斤数">
        {isFinished ? (
          Object.keys(balanceByColor).length ? (
            <div className="prod-overview-grid">
              {Object.entries(balanceByColor).map(([color, val]) => (
                <div key={color} className="prod-overview-card">
                  <div className="pov-icon" style={{ background: "#3498db20", color: "#3498db" }}>
                    <Package size={22} />
                  </div>
                  <span>{color}</span>
                  <strong>{val.packages}包</strong>
                  <small>{val.weightKg}公斤</small>
                  <small className="pov-breakdown">规格：{val.specs.join("、") || "无"}</small>
                </div>
              ))}
            </div>
          ) : <p className="quiet-line">暂无库存记录</p>
        ) : (
          Object.keys(balanceByColorSpec).length ? (
            <div className="prod-overview-grid">
              {Object.entries(balanceByColorSpec).map(([key, val]) => {
                const [name, spec] = key.split("|");
                return (
                  <div key={key} className="prod-overview-card">
                    <div className="pov-icon" style={{ background: "#f39c1220", color: "#f39c12" }}>
                      <Cube size={22} />
                    </div>
                    <span>{name}</span>
                    <strong>{val.packages}包</strong>
                    <small>{val.weightKg}公斤</small>
                    <small className="pov-breakdown">规格：{spec}</small>
                  </div>
                );
              })}
            </div>
          ) : <p className="quiet-line">暂无库存记录</p>
        )}
        <div className="prod-summary prod-grand">
          <span><Calculator size={18} />当前总余量：<strong>{totalPackages}包 / {totalWeightKg}公斤</strong></span>
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
                  <th>包数</th>
                  <th>公斤数</th>
                  <th>单价</th>
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
                  const pkgs = getItemPackages(activeTab, item);
                  const kg = getItemWeightKg(activeTab, item);
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
                        {isOut ? "-" : "+"}{pkgs} 包
                      </td>
                      <td style={{ color: isOut ? "#e74c3c" : "#27ae60" }}>
                        {isOut ? "-" : "+"}{kg} 公斤
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
        description={isFinished ? "选择关联的定型记录，填写包数和公斤数。" : "选择关联的原材料记录，填写包数和公斤数。"}
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
              <span>包数</span>
              <input type="number" step="1" min="0" value={isFinished ? formQuantity : formPackages} onChange={(e) => isFinished ? setFormQuantity(e.target.value) : setFormPackages(e.target.value)} placeholder="包" />
            </label>
            <label className="form-field">
              <span>公斤数</span>
              <input type="number" step="0.01" min="0" value={isFinished ? formWeightKg : formQuantity} onChange={(e) => isFinished ? setFormWeightKg(e.target.value) : setFormQuantity(e.target.value)} placeholder="公斤" />
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
