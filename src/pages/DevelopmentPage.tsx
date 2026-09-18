import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Trash } from "@phosphor-icons/react";
import { Badge, Button, EmptyState, EntityForm, Modal, PageHeader, Section, type FieldDefinition } from "../components/ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

type Product = { id: string; name: string; description?: string; local_path?: string; repository_url?: string; document_url?: string };
type Milestone = { id: string; project_id: string; name: string; target_date?: string; status: string };

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

const projectFields: FieldDefinition[] = [
  { name: "name", label: "商品名称", required: true },
  { name: "description", label: "商品说明", type: "textarea" },
  { name: "local_path", label: "规格型号", placeholder: "例如：200针、168针" },
  { name: "repository_url", label: "供应商", placeholder: "例如：XX纺织" },
  { name: "document_url", label: "备注链接", placeholder: "https://..." },
];

const milestoneFields: FieldDefinition[] = [
  { name: "name", label: "备忘内容", required: true },
  { name: "target_date", label: "日期", type: "date" },
  { name: "status", label: "状态", type: "select", required: true, options: [{ value: "open", label: "进行中" }, { value: "done", label: "已完成" }] },
];

export function DevelopmentPage() {
  const [products, setProducts] = useLocalStorage<Product[]>("sock-erp-products", []);
  const [milestones, setMilestones] = useLocalStorage<Milestone[]>("sock-erp-milestones", []);
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<{ type: string; item?: Record<string, any>; projectId?: string } | null>(null);
  useEffect(() => { const value = params.get("new"); if (value) setDialog({ type: "project" }); }, [params]);
  const close = () => { setDialog(null); setParams({}); };

  const saveProduct = (values: Record<string, any>) => {
    if (values.id) {
      setProducts((prev) => prev.map((p) => p.id === values.id ? { ...p, ...values } as Product : p));
    } else {
      setProducts((prev) => [...prev, { ...values, id: genId() } as Product]);
    }
  };

  const saveMilestone = (values: Record<string, any>) => {
    if (values.id) {
      setMilestones((prev) => prev.map((m) => m.id === values.id ? { ...m, ...values } as Milestone : m));
    } else {
      setMilestones((prev) => [...prev, { ...values, id: genId() } as Milestone]);
    }
  };

  const deleteProduct = (id: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    setMilestones((prev) => prev.filter((m) => m.project_id !== id));
  };

  return (
    <div>
      <PageHeader icon={<ModuleArtwork module="development" />} eyebrow="商品与库存记录" title="商品管理" description="商品、分类、规格、库存各归其位。数据自动云同步。" actions={<Button variant="secondary" onClick={() => setDialog({ type: "project" })}><Plus size={17} />新建商品</Button>} />
      {products.length === 0 ? <EmptyState title="还没有商品" description="建立商品档案后再添加备忘。" action={<Button onClick={() => setDialog({ type: "project" })}>添加第一个商品</Button>} /> : (
        <Section title="商品列表" description="点击卡片查看和编辑商品详情">
          <div className="prod-overview-grid">
            {products.map((item) => {
              const itemMilestones = milestones.filter((m) => m.project_id === item.id);
              return (
                <div key={item.id} className="product-card" onClick={() => setDialog({ type: "project", item })} style={{ cursor: "pointer" }}>
                  <div className="product-card-head">
                    <strong>{item.name}</strong>
                    <Badge tone="neutral">{itemMilestones.length} 条备忘</Badge>
                  </div>
                  <p className="product-card-desc">{item.description || "暂无商品说明"}</p>
                  <div className="product-card-meta">
                    {item.local_path ? <span>规格：{item.local_path}</span> : null}
                    {item.repository_url ? <span>供应商：{item.repository_url}</span> : null}
                  </div>
                  <div className="product-card-actions">
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDialog({ type: "project", item }); }}>编辑</Button>
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDialog({ type: "milestone", item: undefined, projectId: item.id }); }}>备忘录</Button>
                    <Button variant="ghost" size="sm" className="danger-text" onClick={(e) => { e.stopPropagation(); if (confirm(`确定删除商品「${item.name}」及其所有备忘？`)) deleteProduct(item.id); }}><Trash size={14} /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}
      <DevelopmentDialog dialog={dialog} close={close} onSaveProduct={saveProduct} onSaveMilestone={saveMilestone} />
    </div>
  );
}

function DevelopmentDialog({ dialog, close, onSaveProduct, onSaveMilestone }: { dialog: any; close: () => void; onSaveProduct: (v: Record<string, any>) => void; onSaveMilestone: (v: Record<string, any>) => void }) {
  if (!dialog) return null;
  const isProject = dialog.type === "project";
  const title = isProject ? (dialog.item ? "编辑商品" : "新建商品") : (dialog.item ? "编辑备忘录" : "添加备忘录");
  const fields = isProject ? projectFields : milestoneFields;
  const defaults = isProject ? {} : { project_id: dialog.projectId || dialog.item?.project_id, status: "open" };
  const onSave = isProject ? onSaveProduct : onSaveMilestone;
  return <Modal open title={title} description="保存后立即更新并云同步。" onClose={close}><EntityForm fields={fields} initial={{ ...defaults, ...dialog.item }} onCancel={close} onSubmit={async (values) => { onSave(values); close(); }} /></Modal>;
}
