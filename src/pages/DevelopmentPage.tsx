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
  { name: "status", label: "状态", type: "select", required: true, options: [{ value: "active", label: "在售" }, { value: "paused", label: "暂停" }, { value: "completed", label: "已下架" }] },
  { name: "local_path", label: "规格型号", placeholder: "例如：200针、168针" },
  { name: "repository_url", label: "供应商", placeholder: "例如：XX纺织" },
  { name: "document_url", label: "备注链接", placeholder: "https://..." },
];

export function DevelopmentPage() {
  const { data, run } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [projectId, setProjectId] = useState<string | null>(data.devProjects[0]?.id ?? null);
  const [dialog, setDialog] = useState<{ type: string; item?: Record<string, any> } | null>(null);
  useEffect(() => { if (!projectId && data.devProjects[0]) setProjectId(data.devProjects[0].id); }, [data.devProjects, projectId]);
  useEffect(() => { const value = params.get("new"); if (value) setDialog({ type: "project" }); }, [params]);
  const close = () => { setDialog(null); setParams({}); };
  const project = data.devProjects.find((item) => item.id === projectId);
  const milestones = data.devMilestones.filter((item) => item.project_id === projectId);
  return (
    <div>
      <PageHeader icon={<ModuleArtwork module="development" />} eyebrow="商品与库存记录" title="商品管理" description="商品、分类、规格、库存各归其位。" actions={<Button variant="secondary" onClick={() => setDialog({ type: "project" })}><Plus size={17} />新建商品</Button>} />
      {data.devProjects.length === 0 ? <EmptyState title="还没有商品" description="建立商品档案后再添加备忘。" action={<Button onClick={() => setDialog({ type: "project" })}>添加第一个商品</Button>} /> : <div className="workspace-split">
        <aside className="project-rail"><span className="rail-label">商品</span>{data.devProjects.map((item) => <button key={item.id} className={projectId === item.id ? "active" : ""} onClick={() => setProjectId(item.id)}><div><strong>{item.name}</strong><small>{item.description || "没有商品说明"}</small></div><Badge tone={item.status === "active" ? "success" : "neutral"}>{item.status === "active" ? "在售" : item.status === "completed" ? "已下架" : "暂停"}</Badge></button>)}</aside>
        <div className="workspace-detail">
          {project ? <>
            <div className="detail-hero"><div><span className="eyebrow">当前商品</span><h2>{project.name}</h2><p>{project.description || "尚未填写商品说明。"}</p></div><div className="detail-actions"><Button variant="ghost" size="sm" onClick={() => setDialog({ type: "project", item: project })}>编辑</Button></div></div>
            <Section title="备忘录" description="用目标日期记录备忘事项" action={<Button variant="ghost" size="sm" onClick={() => setDialog({ type: "milestone" })}><Plus size={15} />添加</Button>}>
              {milestones.length ? <div className="milestone-row">{milestones.map((item) => <button key={item.id} onClick={() => setDialog({ type: "milestone", item })}><Flag size={18} /><div><strong>{item.name}</strong><small>{item.target_date ? formatDate(item.target_date) : "未设置日期"}</small></div><Badge tone={item.status === "done" ? "success" : "neutral"}>{item.status === "done" ? "完成" : "进行中"}</Badge></button>)}</div> : <p className="quiet-line">这个商品还没有备忘录。</p>}
            </Section>
          </> : null}
        </div>
      </div>}
      <DevelopmentDialog dialog={dialog} project={project} milestones={milestones} close={close} run={run} />
    </div>
  );
}

function DevelopmentDialog({ dialog, project, milestones, close, run }: any) {
  if (!dialog) return null;
  let title = ""; let fields: FieldDefinition[] = []; let collection: any;
  if (dialog.type === "project") { title = dialog.item ? "编辑商品" : "新建商品"; fields = projectFields; collection = "devProjects"; }
  if (dialog.type === "milestone") { title = dialog.item ? "编辑备忘录" : "添加备忘录"; fields = [{ name: "name", label: "备忘内容", required: true }, { name: "target_date", label: "日期", type: "date" }, { name: "status", label: "状态", type: "select", required: true, options: [{ value: "open", label: "进行中" }, { value: "done", label: "已完成" }] }]; collection = "devMilestones"; }
  const defaults: Record<string, any> = dialog.type === "project" ? { status: "active" } : { project_id: project?.id, status: "open" };
  return <Modal open title={title} description="保存后会立即更新。" onClose={close}><EntityForm fields={fields} initial={{ ...defaults, ...dialog.item }} onCancel={close} onSubmit={async (values) => { if (dialog.item?.id) await run(() => api.update(collection, dialog.item.id, values)); else await run(() => api.create(collection, { ...defaults, ...values })); close(); }} /></Modal>;
}
