import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash, Tag, Archive, DotsSixVertical } from "@phosphor-icons/react";
import { PageHeader, Section, Button, Modal, EntityForm, ConfirmDialog, EmptyState, Badge } from "../components/ui";
import type { FieldDefinition } from "../components/ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

type Category = {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
  createdAt: string;
  linkedId?: string;
};

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
  packages?: number;
};

type WarehouseItem = {
  id: string;
  linkedId: string;
  quantity: number;
  packages?: number;
  weightKg?: number;
  type: "in" | "out";
  date?: string;
};

type CategoryType = "product" | "material";

const STORAGE_KEYS: Record<CategoryType, string> = {
  product: "sock-erp-product-categories",
  material: "sock-erp-material-categories",
};

const TYPE_META: Record<CategoryType, { label: string; storageKey: string; emptyText: string }> = {
  product: { label: "商品分类", storageKey: STORAGE_KEYS.product, emptyText: "还没有商品分类，点击右上角添加" },
  material: { label: "原材料分类", storageKey: STORAGE_KEYS.material, emptyText: "还没有原材料分类，点击右上角添加" },
};

function readCategories(type: CategoryType): Category[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[type]);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCategories(type: CategoryType, list: Category[]) {
  localStorage.setItem(STORAGE_KEYS[type], JSON.stringify(list));
}

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

function readDingxing(): DingxingRecord[] {
  return readJsonArray<DingxingRecord>("sock-erp-dingxing");
}

function readRawMaterials(): RawMaterialRecord[] {
  return readJsonArray<RawMaterialRecord>("sock-erp-raw-materials");
}

function readFinishedInventory(): WarehouseItem[] {
  return readJsonArray<WarehouseItem>("sock-erp-finished-inventory");
}

function readMaterialInventory(): WarehouseItem[] {
  return readJsonArray<WarehouseItem>("sock-erp-material-inventory");
}

function calcFinishedBalance(items: WarehouseItem[]): Record<string, { packages: number; weightKg: number }> {
  const balance: Record<string, { packages: number; weightKg: number }> = {};
  items.forEach((item) => {
    if (!balance[item.linkedId]) balance[item.linkedId] = { packages: 0, weightKg: 0 };
    const sign = item.type === "out" ? -1 : 1;
    balance[item.linkedId].packages += sign * Number(item.quantity || 0);
    balance[item.linkedId].weightKg += sign * Number(item.weightKg || 0);
  });
  return balance;
}

function calcMaterialBalance(items: WarehouseItem[]): Record<string, { packages: number; weightKg: number }> {
  const balance: Record<string, { packages: number; weightKg: number }> = {};
  items.forEach((item) => {
    if (!balance[item.linkedId]) balance[item.linkedId] = { packages: 0, weightKg: 0 };
    const sign = item.type === "out" ? -1 : 1;
    balance[item.linkedId].packages += sign * Number(item.packages || 0);
    balance[item.linkedId].weightKg += sign * Number(item.quantity || 0);
  });
  return balance;
}

function genId() {
  return `cat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function CategoryPage() {
  const [activeType, setActiveType] = useState<CategoryType>("product");
  const [productList, setProductList] = useState<Category[]>([]);
  const [materialList, setMaterialList] = useState<Category[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    setProductList(readCategories("product"));
    setMaterialList(readCategories("material"));
  }, []);

  const currentList = activeType === "product" ? productList : materialList;
  const sortedList = useMemo(
    () => [...currentList].sort((a, b) => a.sortOrder - b.sortOrder),
    [currentList]
  );

  // 关联数据源：定型数据（商品分类关联）与原材料采购数据（原材料分类关联）
  const dingxingList = useMemo(() => readDingxing(), []);
  const rawMaterialList = useMemo(() => readRawMaterials(), []);
  const finishedInventory = useMemo(() => readFinishedInventory(), []);
  const materialInventory = useMemo(() => readMaterialInventory(), []);
  const finishedBalance = useMemo(() => calcFinishedBalance(finishedInventory), [finishedInventory]);
  const materialBalance = useMemo(() => calcMaterialBalance(materialInventory), [materialInventory]);

  // 按颜色（商品）或名称（原材料）分组分类
  const groupedCategories = useMemo(() => {
    const groups: Record<string, Category[]> = {};
    sortedList.forEach((cat) => {
      let key = "未分类";
      if (cat.linkedId) {
        if (activeType === "product") {
          const d = dingxingList.find((x) => x.id === cat.linkedId);
          key = d?.color || "未分类";
        } else {
          const r = rawMaterialList.find((x) => x.id === cat.linkedId);
          key = r?.name || "未分类";
        }
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(cat);
    });
    return groups;
  }, [sortedList, activeType, dingxingList, rawMaterialList]);

  // 计算每个分组的总包数和公斤数
  const groupTotals = useMemo(() => {
    const totals: Record<string, { packages: number; weightKg: number }> = {};
    Object.entries(groupedCategories).forEach(([key, cats]) => {
      let packages = 0;
      let weightKg = 0;
      cats.forEach((cat) => {
        if (cat.linkedId) {
          const bal = activeType === "product" ? finishedBalance[cat.linkedId] : materialBalance[cat.linkedId];
          if (bal) {
            packages += bal.packages;
            weightKg += bal.weightKg;
          }
        }
      });
      totals[key] = { packages, weightKg };
    });
    return totals;
  }, [groupedCategories, activeType, finishedBalance, materialBalance]);

  const dingxingOptions = useMemo(
    () => [
      { value: "", label: "不关联" },
      ...dingxingList.map((d) => ({
        value: d.id,
        label: `${d.color ?? ""} - ${d.spec ?? ""} - ${d.name ?? ""}`,
      })),
    ],
    [dingxingList]
  );

  const rawMaterialOptions = useMemo(
    () => [
      { value: "", label: "不关联" },
      ...rawMaterialList.map((r) => ({
        value: r.id,
        label: `${r.name ?? ""} - ${r.spec ?? ""}`,
      })),
    ],
    [rawMaterialList]
  );

  // 根据分类的 linkedId 查找关联记录的展示文案
  function getLinkedText(cat: Category): string | null {
    if (!cat.linkedId) return null;
    if (activeType === "product") {
      const d = dingxingList.find((x) => x.id === cat.linkedId);
      const bal = finishedBalance[cat.linkedId];
      const base = d ? `${d.color ?? ""} / ${d.spec ?? ""}` : "关联已删除";
      if (bal) return `${base} | 余量：${Math.max(0, bal.packages)}包 / ${Math.max(0, bal.weightKg)}公斤`;
      return base;
    }
    const r = rawMaterialList.find((x) => x.id === cat.linkedId);
    const bal = materialBalance[cat.linkedId];
    const base = r ? r.name ?? "" : "关联已删除";
    if (bal) return `${base} | 余量：${Math.max(0, bal.packages)}包 / ${Math.max(0, bal.weightKg)}公斤`;
    return base;
  }

  function updateList(type: CategoryType, list: Category[]) {
    writeCategories(type, list);
    if (type === "product") setProductList(list);
    else setMaterialList(list);
  }

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    setModalOpen(true);
  }

  async function handleSubmit(values: Record<string, any>) {
    const list = activeType === "product" ? [...productList] : [...materialList];
    if (editing) {
      const idx = list.findIndex((c) => c.id === editing.id);
      if (idx >= 0) {
        list[idx] = {
          ...list[idx],
          name: String(values.name).trim(),
          description: String(values.description ?? "").trim(),
          linkedId: String(values.linkedId ?? ""),
        };
      }
    } else {
      // 自动分配排序号：当前最大序号 + 1
      const maxOrder = list.reduce((m, c) => Math.max(m, c.sortOrder || 0), 0);
      list.push({
        id: genId(),
        name: String(values.name).trim(),
        description: String(values.description ?? "").trim(),
        sortOrder: maxOrder + 1,
        createdAt: new Date().toISOString(),
        linkedId: String(values.linkedId ?? ""),
      });
    }
    updateList(activeType, list);
    if (editing) {
      setModalOpen(false);
      setEditing(null);
    } else {
      // 连续输入：保持弹窗打开，重置表单
      setFormKey((k) => k + 1);
    }
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    let list = (activeType === "product" ? productList : materialList).filter((c) => c.id !== deleteTarget.id);
    // 删除后重新排列序号
    list = list.map((c, idx) => ({ ...c, sortOrder: idx + 1 }));
    updateList(activeType, list);
    setDeleteTarget(null);
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverId !== id) setDragOverId(id);
  }

  function handleDragLeave() {
    setDragOverId(null);
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    const list = [...sortedList];
    const fromIdx = list.findIndex((c) => c.id === draggedId);
    const toIdx = list.findIndex((c) => c.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    // 重新排列序号
    const renumbered = list.map((c, idx) => ({ ...c, sortOrder: idx + 1 }));
    updateList(activeType, renumbered);
    setDraggedId(null);
    setDragOverId(null);
  }

  function handleDragEnd() {
    setDraggedId(null);
    setDragOverId(null);
  }

  const fields: FieldDefinition[] = [
    { name: "name", label: "分类名称", type: "text", required: true, placeholder: "如：棉袜 / 纱线" },
    { name: "description", label: "分类说明", type: "textarea", placeholder: "可选，描述该分类的用途" },
    activeType === "product"
      ? { name: "linkedId", label: "关联定型", type: "select", options: dingxingOptions }
      : { name: "linkedId", label: "关联原材料", type: "select", options: rawMaterialOptions },
  ];

  return (
    <>
      <PageHeader
        icon={<ModuleArtwork module="fitness" />}
        eyebrow="基础数据"
        title="分类中心"
        description="维护商品分类和原材料分类，关联仓库库存，序号自动排列，支持拖拽排序。"
        actions={
          <Button onClick={openAdd}><Plus size={17} />添加{TYPE_META[activeType].label}</Button>
        }
      />

      <div className="category-tabs" role="tablist">
        {(["product", "material"] as CategoryType[]).map((type) => (
          <button
            key={type}
            role="tab"
            aria-selected={activeType === type}
            className={activeType === type ? "category-tab active" : "category-tab"}
            onClick={() => setActiveType(type)}
          >
            {type === "product" ? <Tag size={16} /> : <Archive size={16} />}
            {TYPE_META[type].label}
            <Badge tone="neutral">{type === "product" ? productList.length : materialList.length}</Badge>
          </button>
        ))}
      </div>

      <Section title={TYPE_META[activeType].label} description={`共 ${currentList.length} 个分类，按${activeType === "product" ? "颜色" : "名称"}分组，拖拽可调整顺序`}>
        {sortedList.length === 0 ? (
          <EmptyState title="暂无分类" description={TYPE_META[activeType].emptyText} />
        ) : (
          <div>
            {Object.entries(groupedCategories).map(([groupKey, cats]) => {
              const total = groupTotals[groupKey];
              return (
                <div key={groupKey} style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "#f8f9fa", borderRadius: 8, marginBottom: 8 }}>
                    <strong style={{ fontSize: 15 }}>{groupKey}</strong>
                    <span style={{ fontSize: 13, color: "#666" }}>{cats.length} 个分类</span>
                    <span style={{ marginLeft: "auto", fontSize: 13, color: "#3498db" }}>{Math.max(0, total.packages)}包 / {Math.max(0, total.weightKg)}公斤</span>
                  </div>
                  <div className="category-list">
                    {cats.map((cat, idx) => (
                      <div
                        key={cat.id}
                        className={`category-item glass-clear ${draggedId === cat.id ? "category-dragging" : ""} ${dragOverId === cat.id && draggedId !== cat.id ? "category-drag-over" : ""}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, cat.id)}
                        onDragOver={(e) => handleDragOver(e, cat.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, cat.id)}
                        onDragEnd={handleDragEnd}
                      >
                        <div className="category-drag-handle" title="拖拽排序">
                          <DotsSixVertical size={18} />
                        </div>
                        <div className="category-item-main">
                          <span className="category-sort">{sortedList.findIndex(c => c.id === cat.id) + 1}</span>
                          <div>
                            <div className="category-name">{cat.name}</div>
                            {cat.description ? <div className="category-desc">{cat.description}</div> : null}
                            {(() => {
                              const linkedText = getLinkedText(cat);
                              return linkedText ? <div className="category-desc">关联：{linkedText}</div> : null;
                            })()}
                          </div>
                        </div>
                        <div className="category-item-actions">
                          <button className="icon-btn" onClick={() => openEdit(cat)} aria-label="编辑"><Pencil size={16} /></button>
                          <button className="icon-btn danger" onClick={() => setDeleteTarget(cat)} aria-label="删除"><Trash size={16} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        title={editing ? `编辑${TYPE_META[activeType].label}` : `添加${TYPE_META[activeType].label}`}
        description="分类名称必填，序号自动分配，保存后可拖拽调整顺序。"
      >
        <EntityForm
          key={formKey}
          fields={fields}
          initial={editing ? { name: editing.name, description: editing.description, linkedId: editing.linkedId ?? "" } : {}}
          submitLabel={editing ? "保存修改" : "保存并继续"}
          onSubmit={handleSubmit}
          onCancel={() => { setModalOpen(false); setEditing(null); }}
        />
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除分类"
        description={`确定要删除分类「${deleteTarget?.name}」吗？此操作不可撤销。`}
        confirmLabel="删除"
        danger
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
