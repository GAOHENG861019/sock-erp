import { useEffect, useMemo, useState } from "react";
import { Trash, Calculator, Plus } from "@phosphor-icons/react";
import { Button, EmptyState, Modal, PageHeader, Section } from "../components/ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

type RawMaterial = { id: string; name: string; spec: string; weight: number; unitPrice: number; amount: number; photo?: string };

function useRawMaterials() {
  const [items, setItems] = useState<RawMaterial[]>(() => {
    try { const raw = localStorage.getItem("sock-erp-raw-materials"); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem("sock-erp-raw-materials", JSON.stringify(items)); } catch { /* ignore */ } }, [items]);
  return [items, setItems] as const;
}

export function FitnessPage() {
  const [rawMaterials, setRawMaterials] = useRawMaterials();
  const [rawDialog, setRawDialog] = useState<RawMaterial | null>(null);
  const rawTotal = useMemo(() => rawMaterials.reduce((s, i) => s + Number(i.amount || 0), 0), [rawMaterials]);
  const rawWeight = useMemo(() => rawMaterials.reduce((s, i) => s + Number(i.weight || 0), 0), [rawMaterials]);

  return (
    <div>
      <PageHeader icon={<ModuleArtwork module="fitness" />} eyebrow="采购与供应商" title="原材料采购" description="记录原材料采购明细，自动合计重量和金额。" actions={<Button onClick={() => setRawDialog({ id: "", name: "", spec: "", weight: 0, unitPrice: 0, amount: 0 })}><Plus size={17} />添加原材料</Button>} />
      <div className="overview-strip" style={{ marginBottom: 16 }}>
        <div><span>原材料种类</span><strong>{rawMaterials.length}</strong></div>
        <div><span>总重量</span><strong>{rawWeight.toFixed(2)}<small> 公斤</small></strong></div>
        <div><span>采购总额</span><strong>¥{rawTotal.toFixed(2)}</strong></div>
      </div>
      <Section title="原材料清单" description="添加名称、规格、重量(公斤)和单价(元/公斤)，金额自动计算，可上传照片">
        {rawMaterials.length ? <><table className="prod-table"><thead><tr><th>照片</th><th>名称</th><th>规格</th><th>重量(公斤)</th><th>单价(元/公斤)</th><th>金额</th><th>操作</th></tr></thead><tbody>{rawMaterials.map((item) => <tr key={item.id}><td>{item.photo ? <img src={item.photo} alt={item.name} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6 }} /> : <span style={{ color: "#999", fontSize: 12 }}>无</span>}</td><td>{item.name}</td><td>{item.spec || "-"}</td><td>{item.weight} 公斤</td><td>¥{Number(item.unitPrice || 0).toFixed(2)}/公斤</td><td>¥{Number(item.amount).toFixed(2)}</td><td><button className="icon-button danger-text" title="删除" onClick={() => setRawMaterials((prev) => prev.filter((r) => r.id !== item.id))}><Trash size={16} /></button></td></tr>)}</tbody></table><div className="prod-summary prod-grand"><span><Calculator size={18} />原材料总额度：<strong>¥{rawTotal.toFixed(2)}</strong></span></div></> : <EmptyState title="还没有原材料" description="点击添加原材料，记录名称、规格、重量和单价。" action={<Button variant="secondary" onClick={() => setRawDialog({ id: "", name: "", spec: "", weight: 0, unitPrice: 0, amount: 0 })}>添加第一个原材料</Button>} />}
      </Section>
      <RawMaterialDialog open={rawDialog} onClose={() => setRawDialog(null)} onSave={(item) => { setRawMaterials((prev) => item.id ? prev.map((r) => r.id === item.id ? item : r) : [...prev, { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }]); setRawDialog(null); }} />
    </div>
  );
}

function RawMaterialDialog({ open, onClose, onSave }: { open: RawMaterial | null; onClose: () => void; onSave: (item: RawMaterial) => void }) {
  const [form, setForm] = useState<RawMaterial>({ id: "", name: "", spec: "", weight: 0, unitPrice: 0, amount: 0 });
  useEffect(() => { if (open) setForm(open); }, [open]);
  if (!open) return null;
  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm({ ...form, photo: reader.result as string });
    reader.readAsDataURL(file);
  };
  const calcAmount = (weight: number, unitPrice: number) => Number((weight * unitPrice).toFixed(2));
  return (
    <Modal open title={open.id ? "编辑原材料" : "添加原材料"} description="填写名称、规格、重量(公斤)和单价(元/公斤)，金额自动计算，可上传照片" onClose={onClose}>
      <div className="form-grid">
        <label className="form-field"><span>名称<em>必填</em></span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：棉纱、橡筋" /></label>
        <label className="form-field"><span>规格</span><input value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} placeholder="例如：32支、40支" /></label>
        <label className="form-field"><span>重量(公斤)</span><input type="number" step="0.01" value={form.weight || ""} onChange={(e) => { const w = Number(e.target.value) || 0; setForm({ ...form, weight: w, amount: calcAmount(w, form.unitPrice) }); }} placeholder="公斤" /></label>
        <label className="form-field"><span>单价(元/公斤)</span><input type="number" step="0.01" value={form.unitPrice || ""} onChange={(e) => { const p = Number(e.target.value) || 0; setForm({ ...form, unitPrice: p, amount: calcAmount(form.weight, p) }); }} placeholder="元/公斤" /></label>
        <label className="form-field"><span>金额(自动计算)</span><input type="number" step="0.01" value={form.amount || ""} readOnly style={{ background: "#f5f5f5" }} placeholder="自动计算" /></label>
      </div>
      <div style={{ marginTop: 12 }}>
        <span style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 6 }}>照片（可选）</span>
        <input type="file" accept="image/*" onChange={handlePhoto} style={{ marginBottom: 8 }} />
        {form.photo ? <div><img src={form.photo} alt="预览" style={{ maxWidth: 200, maxHeight: 150, borderRadius: 8, border: "1px solid #eee" }} /><br /><button type="button" onClick={() => setForm({ ...form, photo: undefined })} style={{ marginTop: 6, fontSize: 12, color: "#e74c3c", background: "none", border: "none", cursor: "pointer" }}>移除照片</button></div> : null}
      </div>
      <footer className="modal-actions">
        <Button variant="ghost" onClick={onClose}>取消</Button>
        <Button onClick={() => { if (form.name.trim()) onSave(form); }}>保存</Button>
      </footer>
    </Modal>
  );
}
