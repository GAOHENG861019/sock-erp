import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Flag, Trash } from "@phosphor-icons/react";
import { api } from "../api";
import { useWorkspace } from "../WorkspaceContext";
import { formatDate, localDate } from "../utils";
import { Badge, Button, EmptyState, EntityForm, Modal, PageHeader, Section, type FieldDefinition } from "../components/ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

const projectFields: FieldDefinition[] = [
  { name: "name", label: "商品名称", required: true },
  { name: "description", label: "商品说明", type: "textarea" },
  { name: "local_path", label: "规格型号", placeholder: "例如：200针、168针" },
  { name: "repository_url", label: "供应商", placeholder: "例如：XX纺织" },
  { name: "document_url", label: "备注链接", placeholder: "https://..." },
];

export function DevelopmentPage() {
  const { data, run } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<{ type: string; item?: Record<string, any> } | null>(null);
  useEffect(() => { const value = params.get("new"); if (value) setDialog({ type: "project" }); }, [params]);
  const close = () => { setDialog(null); setParams({}); };
  return (
    <div>
      <PageHeader icon={<ModuleArtwork module="development" />} eyebrow="商品与库存记录" title="商品管理" description="商品、分类、规格、库存各归其位。" actions={<Button variant="secondary" onClick={() => setDialog({ type: "project" })}><Plus size={17} />新建商品</Button>} />
      {data.devProjects.length === 0 ? <EmptyState title="还没有商品" description="建立商品档案后再添加备忘。" action={<Button onClick={() => setDialog({ type: "project" })}>添加第一个商品</Button>} /> : (
        <Section title="商品列表" description="点击卡片查看和编辑商品详情">
          <div className="prod-overview-grid">
            {data.devProjects.map((item) => {
              const itemMilestones = data.devMilestones.filter((m) => m.project_id === item.id);
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
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}
      <DevelopmentDialog dialog={dialog} close={close} run={run} />
    </div>
  );
}

function DevelopmentDialog({ dialog, close, run }: any) {
  if (!dialog) return null;
  let title = ""; let fields: FieldDefinition[] = []; let collection: any;
  if (dialog.type === "project") { title = dialog.item ? "编辑商品" : "新建商品"; fields = projectFields; collection = "devProjects"; }
  if (dialog.type === "milestone") { title = dialog.item ? "编辑备忘录" : "添加备忘录"; fields = [{ name: "name", label: "备忘内容", required: true }, { name: "target_date", label: "日期", type: "date" }, { name: "status", label: "状态", type: "select", required: true, options: [{ value: "open", label: "进行中" }, { value: "done", label: "已完成" }] }]; collection = "devMilestones"; }
  const defaults: Record<string, any> = dialog.type === "project" ? {} : { project_id: dialog.projectId || dialog.item?.project_id, status: "open" };
  return <Modal open title={title} description="保存后会立即更新。" onClose={close}><EntityForm fields={fields} initial={{ ...defaults, ...dialog.item }} onCancel={close} onSubmit={async (values) => { if (dialog.item?.id) await run(() => api.update(collection, dialog.item.id, values)); else await run(() => api.create(collection, { ...defaults, ...values })); close(); }} /></Modal>;
}
