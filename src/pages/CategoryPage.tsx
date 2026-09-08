import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash, Tag, Archive } from "@phosphor-icons/react";
import { PageHeader, Section, Button, Modal, EntityForm, ConfirmDialog, EmptyState, Badge } from "../components/ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

type Category = {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
  createdAt: string;
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

  useEffect(() => {
    setProductList(readCategories("product"));
    setMaterialList(readCategories("material"));
  }, []);

  const currentList = activeType === "product" ? productList : materialList;
  const sortedList = useMemo(
    () => [...currentList].sort((a, b) => a.sortOrder - b.sortOrder),
    [currentList]
  );

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
        list[idx] = { ...list[idx], name: String(values.name).trim(), description: String(values.description ?? "").trim(), sortOrder: Number(values.sortOrder) || 0 };
      }
    } else {
      list.push({
        id: genId(),
        name: String(values.name).trim(),
        description: String(values.description ?? "").trim(),
        sortOrder: Number(values.sortOrder) || 0,
        createdAt: new Date().toISOString(),
      });
    }
    updateList(activeType, list);
    setModalOpen(false);
    setEditing(null);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const list = (activeType === "product" ? productList : materialList).filter((c) => c.id !== deleteTarget.id);
    updateList(activeType, list);
    setDeleteTarget(null);
  }

  const fields = [
    { name: "name", label: "分类名称", type: "text" as const, required: true, placeholder: "如：棉袜 / 纱线" },
    { name: "description", label: "分类说明", type: "textarea" as const, placeholder: "可选，描述该分类的用途" },
    { name: "sortOrder", label: "排序序号", type: "number" as const, placeholder: "数字越小越靠前", step: "1" },
  ];

  return (
    <>
      <PageHeader
        icon={<ModuleArtwork module="fitness" />}
        eyebrow="基础数据"
        title="分类中心"
        description="维护商品分类和原材料分类，供商品管理、原材料采购等模块引用。"
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

      <Section title={TYPE_META[activeType].label} description={`共 ${currentList.length} 个分类`}>
        {sortedList.length === 0 ? (
          <EmptyState title="暂无分类" description={TYPE_META[activeType].emptyText} />
        ) : (
          <div className="category-list">
            {sortedList.map((cat, idx) => (
              <div key={cat.id} className="category-item glass-clear">
                <div className="category-item-main">
                  <span className="category-sort">{cat.sortOrder > 0 ? cat.sortOrder : idx + 1}</span>
                  <div>
                    <div className="category-name">{cat.name}</div>
                    {cat.description ? <div className="category-desc">{cat.description}</div> : null}
                  </div>
                </div>
                <div className="category-item-actions">
                  <button className="icon-btn" onClick={() => openEdit(cat)} aria-label="编辑"><Pencil size={16} /></button>
                  <button className="icon-btn danger" onClick={() => setDeleteTarget(cat)} aria-label="删除"><Trash size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        title={editing ? `编辑${TYPE_META[activeType].label}` : `添加${TYPE_META[activeType].label}`}
        description="分类名称必填，排序序号用于控制显示顺序。"
      >
        <EntityForm
          fields={fields}
          initial={editing ? { name: editing.name, description: editing.description, sortOrder: editing.sortOrder } : { sortOrder: 0 }}
          submitLabel={editing ? "保存修改" : "添加分类"}
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
