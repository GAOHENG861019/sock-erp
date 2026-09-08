import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Package, Play, Stop, CalendarPlus, Timer, Star, PencilSimple } from "@phosphor-icons/react";
import { api } from "../api";
import { useWorkspace } from "../WorkspaceContext";
import { formatDate, formatDateTime, formatDuration, localDate } from "../utils";
import { Badge, Button, EmptyState, EntityForm, Modal, PageHeader, Section, type FieldDefinition } from "../components/ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

const statusLabels: Record<string, string> = { wishlist: "待采购", playing: "采购中", paused: "暂停", completed: "已完成" };

/** 采购单照片存在 localStorage，按商品 ID 关联，不动数据库 */
function usePurchasePhotos() {
  const [photos, setPhotos] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem("sock-erp-purchase-photos");
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem("sock-erp-purchase-photos", JSON.stringify(photos)); } catch { /* ignore */ }
  }, [photos]);
  return [photos, setPhotos] as const;
}

export function EntertainmentPage() {
  const { data, run } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState("playing");
  const [dialog, setDialog] = useState<{ type: string; item?: Record<string, any> } | null>(null);
  const [photos, setPhotos] = usePurchasePhotos();
  useEffect(() => { if (params.get("new")) setDialog({ type: "item" }); }, [params]);
  const close = () => { setDialog(null); setParams({}); };
  const items = data.entertainmentItems.filter((item) => filter === "all" || item.status === filter);
  const activeSessions = data.playSessions.filter((item) => !item.ended_at);
  const totals = useMemo(() => Object.fromEntries(data.entertainmentItems.map((item) => [item.id, data.playSessions.filter((session) => session.entertainment_id === item.id).reduce((sum, session) => sum + Number(session.duration_minutes || 0), 0)])), [data.entertainmentItems, data.playSessions]);
  const startSession = async (item: Record<string, any>) => { await run(async () => { if (item.status !== "playing") await api.update("entertainmentItems", item.id, { status: "playing" }); return api.create("playSessions", { entertainment_id: item.id, started_at: new Date().toISOString(), progress_note: "" }); }); };
  const stopSession = async (session: Record<string, any>) => { const ended = new Date(); const duration = Math.max(1, Math.round((ended.getTime() - new Date(session.started_at).getTime()) / 60_000)); await run(() => api.update("playSessions", session.id, { ended_at: ended.toISOString(), duration_minutes: duration })); };
  return (
    <div>
      <PageHeader icon={<ModuleArtwork module="entertainment" />} eyebrow="采购与进度" title="采购单" description="记录待采购、采购中和已完成的采购单，关联原料中心。" actions={<Button onClick={() => setDialog({ type: "item" })}><Plus size={17} />添加商品</Button>} />
      {activeSessions.length ? <div className="now-playing">{activeSessions.map((session) => { const item = data.entertainmentItems.find((value) => value.id === session.entertainment_id); return <div key={session.id}><span className="live-dot" /><div><small>正在进行</small><strong>{item?.name || "娱乐活动"}</strong><span>开始于 {formatDateTime(session.started_at)}</span></div><Button variant="secondary" onClick={() => void stopSession(session)}><Stop size={16} />结束并记录</Button></div>; })}</div> : null}
      <div className="entertainment-toolbar"><div className="segmented">{["playing", "wishlist", "paused", "completed", "all"].map((value) => <button className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)}>{value === "all" ? "全部" : statusLabels[value]}</button>)}</div></div>
      {items.length ? <div className="game-grid">{items.map((item) => {
        const active = activeSessions.find((session) => session.entertainment_id === item.id);
        return <article className="game-card" key={item.id}><div className="game-cover">{photos[item.id] ? <img src={photos[item.id]} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Package size={32} />}<Badge tone={item.status === "playing" ? "accent" : item.status === "completed" ? "success" : "neutral"}>{statusLabels[item.status]}</Badge></div><div className="game-content"><span>{item.platform || item.activity_type || "商品"}</span><h2>{item.name}</h2><p>{item.progress || "尚未记录采购进度"}</p><div className="next-goal"><small>采购目标</small><strong>{item.next_goal || "按需采购"}</strong></div><div className="game-meta"><span><Timer size={15} />{formatDuration(totals[item.id] || 0)}</span>{item.rating ? <span><Star size={15} weight="fill" />{item.rating}</span> : null}</div><div className="game-actions">{active ? <Button variant="secondary" size="sm" onClick={() => void stopSession(active)}><Stop size={15} />结束</Button> : <Button size="sm" onClick={() => void startSession(item)}><Play size={15} />开始采购</Button>}<Button variant="ghost" size="sm" onClick={() => setDialog({ type: "item", item })}><PencilSimple size={15} />编辑</Button><Button variant="ghost" size="sm" onClick={() => void run(() => api.create("planItems", { title: `采购：${item.name}`, plan_date: localDate(), source_module: "entertainment", source_entity_type: "entertainment_item", source_entity_id: item.id, priority: "low" }))}><CalendarPlus size={15} />安排时间</Button></div></div></article>;
      })}</div> : <EmptyState title="还没有采购商品" description="添加需要采购的商品，关联原料中心。" action={<Button variant="secondary" onClick={() => setDialog({ type: "item" })}>添加商品</Button>} />}
      <Section title="最近采购记录" description="记录采购进度和时间">
        {data.playSessions.filter((item) => item.ended_at).length ? <div className="session-list">{data.playSessions.filter((item) => item.ended_at).slice(0, 12).map((session) => { const item = data.entertainmentItems.find((value) => value.id === session.entertainment_id); return <article key={session.id}><div><strong>{item?.name || "已删除项目"}</strong><small>{formatDate(session.started_at)}</small></div><span>{formatDuration(session.duration_minutes)}</span><p>{session.progress_note || "没有补充进度"}</p></article>; })}</div> : <p className="quiet-line">还没有完成的采购记录。</p>}
      </Section>
      <EntertainmentDialog dialog={dialog} close={close} run={run} currentPhoto={dialog?.item?.id ? photos[dialog.item.id] : undefined} onSavePhoto={(id: string, photo: string) => setPhotos((prev) => ({ ...prev, [id]: photo }))} onRemovePhoto={(id: string) => setPhotos((prev) => { const next = { ...prev }; delete next[id]; return next; })} />
    </div>
  );
}

function EntertainmentDialog({ dialog, close, run, currentPhoto, onSavePhoto, onRemovePhoto }: any) {
  if (!dialog) return null;
  const [photo, setPhoto] = useState<string | undefined>(currentPhoto);
  useEffect(() => { setPhoto(currentPhoto); }, [currentPhoto, dialog?.item?.id]);
  const fields: FieldDefinition[] = [
    { name: "name", label: "商品名称", required: true },
    { name: "platform", label: "供应商", placeholder: "例如：XX纺织、YY原料厂" },
    { name: "activity_type", label: "商品类型", type: "select", required: true, options: [{ value: "game", label: "原材料" }, { value: "movie", label: "辅料" }, { value: "reading", label: "包装" }, { value: "other", label: "其他" }] },
    { name: "status", label: "状态", type: "select", required: true, options: Object.entries(statusLabels).map(([value, label]) => ({ value, label })) },
    { name: "progress", label: "采购进度", type: "textarea" },
    { name: "next_goal", label: "采购目标" },
    { name: "notes", label: "备注", type: "textarea" },
    { name: "rating", label: "优先级（0-10）", type: "number", step: "0.5" },
    { name: "completed_date", label: "完成日期", type: "date" },
  ];
  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  };
  return <Modal open title={dialog.item?.id ? "编辑商品" : "添加商品"} description="采购单记录，可上传商品照片" onClose={close}>
    <EntityForm fields={fields} initial={{ activity_type: "game", status: "wishlist", ...dialog.item }} onCancel={close} onSubmit={async (values) => {
      let savedId = dialog.item?.id;
      if (dialog.item?.id) { await run(() => api.update("entertainmentItems", dialog.item.id, values)); }
      else { const created = await run(() => api.create("entertainmentItems", values)); savedId = created.id; }
      if (photo) onSavePhoto(savedId, photo);
      else if (dialog.item?.id) onRemovePhoto(savedId);
      close();
    }} />
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #eee" }}>
      <span style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 6 }}>商品照片（可选）</span>
      <input type="file" accept="image/*" onChange={handlePhoto} style={{ marginBottom: 8 }} />
      {photo ? <div><img src={photo} alt="预览" style={{ maxWidth: 200, maxHeight: 150, borderRadius: 8, border: "1px solid #eee" }} /><br /><button type="button" onClick={() => setPhoto(undefined)} style={{ marginTop: 6, fontSize: 12, color: "#e74c3c", background: "none", border: "none", cursor: "pointer" }}>移除照片</button></div> : null}
    </div>
  </Modal>;
}
