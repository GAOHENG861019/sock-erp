import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trash, Calculator, Plus, Pencil } from "@phosphor-icons/react";
import { Button, EmptyState, Modal, PageHeader, Section } from "../components/ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

type RawMaterial = { id: string; name: string; spec: string; weight: number; unitPrice: number; amount: number; packages?: number; photo?: string; payer?: string };

const RAW_MATERIALS_KEY = "sock-erp-raw-materials";

// 连续录入时跨条目记住的字段（规格/采购人/单重/单价），名称与包数每条不同不记忆
const RAW_MATERIAL_LAST_KEY = "sock-erp-raw-material-last";
type StickyRawMaterialValues = Pick<RawMaterial, "spec" | "weight" | "unitPrice" | "payer">;

/** 读取上次录入记住的规格/采购人/单重/单价，作为新增对话框默认值 */
function readStickyDefaults(): StickyRawMaterialValues {
  try {
    const parsed = JSON.parse(localStorage.getItem(RAW_MATERIAL_LAST_KEY) || "null");
    if (parsed && typeof parsed === "object") {
      return {
        spec: typeof parsed.spec === "string" ? parsed.spec : "",
        payer: typeof parsed.payer === "string" ? parsed.payer : "",
        weight: Number(parsed.weight) || 0,
        unitPrice: Number(parsed.unitPrice) || 0,
      };
    }
  } catch { /* ignore */ }
  return { spec: "", weight: 0, unitPrice: 0, payer: "" };
}

/** 新增成功后记住本次的规格/采购人/单重/单价，供下一条默认填充 */
function rememberStickyValues(item: RawMaterial): StickyRawMaterialValues {
  const sticky: StickyRawMaterialValues = {
    spec: item.spec || "",
    payer: item.payer || "",
    weight: Number(item.weight) || 0,
    unitPrice: Number(item.unitPrice) || 0,
  };
  try {
    localStorage.setItem(RAW_MATERIAL_LAST_KEY, JSON.stringify(sticky));
  } catch { /* ignore */ }
  return sticky;
}


function readRawMaterials(): RawMaterial[] {
  try {
    const raw = localStorage.getItem(RAW_MATERIALS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useRawMaterials() {
  const [items, setItemsState] = useState<RawMaterial[]>(readRawMaterials);
  // 始终保存最新的 items，使 setItems 能在 React 重渲染前同步计算并落盘
  const itemsRef = useRef<RawMaterial[]>(items);

  const setItems = useCallback(
    (updater: RawMaterial[] | ((prev: RawMaterial[]) => RawMaterial[])) => {
      const prev = itemsRef.current;
      const next = typeof updater === "function" ? updater(prev) : updater;
      itemsRef.current = next;
      // 同步落盘：消除「React state 已更新但持久化 effect 尚未执行」的竞态窗口。
      // 否则手机冷启动时云拉取/实时推送在该窗口到达，会读取到不含新项的旧 localStorage
      // 并经事件覆盖 state，表现为「保存并继续后原材料添加不进」。
      try {
        const nextStr = JSON.stringify(next);
        if (localStorage.getItem(RAW_MATERIALS_KEY) !== nextStr) {
          localStorage.setItem(RAW_MATERIALS_KEY, nextStr);
        }
      } catch { /* ignore */ }
      setItemsState(next);
    },
    [],
  );

  // 持久化兜底：云事件把数据写入本地后，effect 保证 state 与本地一致；相同则跳过，
  // 避免把同一份云端数据回写并多上传一次。
  useEffect(() => {
    itemsRef.current = items;
    try {
      const next = JSON.stringify(items);
      if (localStorage.getItem(RAW_MATERIALS_KEY) !== next) {
        localStorage.setItem(RAW_MATERIALS_KEY, next);
      }
    } catch { /* ignore */ }
  }, [items]);

  // 手机冷启动时组件可能先于云拉取挂载、读到空数据。监听云同步事件刷新状态，
  // 否则随后新增会基于挂载时的空状态把云端已有原材料整体覆盖（表现为“无法添加”）。
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { key?: string } | undefined;
      if (detail?.key && detail.key !== RAW_MATERIALS_KEY) return;
      const latest = readRawMaterials();
      setItemsState((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(latest)) return prev;
        // 按 id 并集：保留当前 state 中存在但本地快照暂缺的条目（窗口期内本地刚新增、
        // 尚未被云拉取读到的项），同时接纳云端新到的条目。删除已同步落盘，不会被误恢复。
        const latestIds = new Set(latest.map((i) => i.id));
        const localOnly = prev.filter((i) => !latestIds.has(i.id));
        if (localOnly.length === 0) return latest;
        const prevIds = new Set(prev.map((i) => i.id));
        const cloudOnly = latest.filter((i) => !prevIds.has(i.id));
        return [...prev, ...cloudOnly];
      });
    };
    window.addEventListener("cloud-storage-sync", handler);
    window.addEventListener("cloud-storage-local", handler);
    return () => {
      window.removeEventListener("cloud-storage-sync", handler);
      window.removeEventListener("cloud-storage-local", handler);
    };
  }, []);

  return [items, setItems] as const;
}

export function FitnessPage() {
  const [rawMaterials, setRawMaterials] = useRawMaterials();
  const [rawDialog, setRawDialog] = useState<RawMaterial | null>(null);
  const rawTotal = useMemo(() => rawMaterials.reduce((s, i) => s + Number(i.amount || 0), 0), [rawMaterials]);
  const rawWeight = useMemo(() => rawMaterials.reduce((s, i) => s + Number(i.packages || 0) * Number(i.weight || 0), 0), [rawMaterials]);
  const rawPackages = useMemo(() => rawMaterials.reduce((s, i) => s + Number(i.packages || 0), 0), [rawMaterials]);

  return (
    <div>
      <PageHeader icon={<ModuleArtwork module="fitness" />} eyebrow="采购与供应商" title="原材料采购" description="记录原材料采购明细，总重量=包数×单重，金额=包数×单重×单价。" actions={<Button onClick={() => setRawDialog({ id: "", name: "", packages: 0, amount: 0, ...readStickyDefaults() })}><Plus size={17} />添加原材料</Button>} />
      <div className="overview-strip" style={{ marginBottom: 16 }}>
        <div><span>原材料种类</span><strong>{rawMaterials.length}</strong></div>
        <div><span>总重量</span><strong>{rawWeight.toFixed(2)}<small> 公斤</small></strong></div>
        <div><span>总包数</span><strong>{rawPackages}<small> 包</small></strong></div>
        <div><span>采购总额</span><strong>¥{rawTotal.toFixed(2)}</strong></div>
      </div>
      <Section title="原材料清单" description="添加名称、规格、包数、单重(公斤/包)和单价(元/公斤)，总重量和金额自动计算，可上传照片">
        {rawMaterials.length ? <><table className="prod-table"><thead><tr><th>照片</th><th>名称</th><th>规格</th><th>采购人</th><th>包数</th><th>单重(公斤)</th><th>总重量(公斤)</th><th>单价(元/公斤)</th><th>金额</th><th>操作</th></tr></thead><tbody>{rawMaterials.map((item) => { const totalW = Number(item.packages || 0) * Number(item.weight || 0); return <tr key={item.id}><td>{item.photo ? <img src={item.photo} alt={item.name} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6 }} /> : <span style={{ color: "#999", fontSize: 12 }}>无</span>}</td><td>{item.name}</td><td>{item.spec || "-"}</td><td>{item.payer || "-"}</td><td>{item.packages || 0} 包</td><td>{item.weight} 公斤</td><td>{totalW.toFixed(2)} 公斤</td><td>¥{Number(item.unitPrice || 0).toFixed(2)}/公斤</td><td>¥{Number(item.amount).toFixed(2)}</td><td><button className="icon-button" title="编辑" onClick={() => setRawDialog(item)}><Pencil size={16} /></button><button className="icon-button danger-text" title="删除" onClick={() => setRawMaterials((prev) => prev.filter((r) => r.id !== item.id))}><Trash size={16} /></button></td></tr>; })}</tbody></table><div className="prod-summary prod-grand"><span><Calculator size={18} />原材料总额度：<strong>¥{rawTotal.toFixed(2)}</strong></span></div></> : <EmptyState title="还没有原材料" description="点击添加原材料，记录名称、规格、重量和单价。" action={<Button variant="secondary" onClick={() => setRawDialog({ id: "", name: "", packages: 0, amount: 0, ...readStickyDefaults() })}>添加第一个原材料</Button>} />}
      </Section>
      <RawMaterialDialog open={rawDialog} onClose={() => setRawDialog(null)} onSave={(item) => { setRawMaterials((prev) => item.id ? prev.map((r) => r.id === item.id ? item : r) : [...prev, { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }]); }} />
    </div>
  );
}

function RawMaterialDialog({ open, onClose, onSave }: { open: RawMaterial | null; onClose: () => void; onSave: (item: RawMaterial) => void }) {
  const [form, setForm] = useState<RawMaterial>({ id: "", name: "", spec: "", weight: 0, unitPrice: 0, amount: 0, packages: 0 });
  const [nameError, setNameError] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setForm(open); setNameError(""); } }, [open]);
  if (!open) return null;
  const isEditing = !!form.id;
  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm({ ...form, photo: reader.result as string });
    reader.readAsDataURL(file);
  };
  const calcAmount = (packages: number, weight: number, unitPrice: number) => Number((packages * weight * unitPrice).toFixed(2));
  const totalWeight = Number(form.packages || 0) * Number(form.weight || 0);
  const handleSave = () => {
    // 手机中文输入法 / captureInput 下受控值可能在提交瞬间未及时同步，兜底从输入框读取一次
    let name = form.name;
    if (!name.trim() && nameInputRef.current) {
      name = nameInputRef.current.value || "";
    }
    name = name.trim();
    if (!name) {
      // 不再静默返回，明确提示，避免用户点了“保存并继续”却没有任何反馈
      setNameError("请填写名称");
      nameInputRef.current?.focus();
      return;
    }
    const saved = { ...form, name };
    onSave(saved);
    setNameError("");
    if (isEditing) {
      onClose();
    } else {
      // 记住规格/采购人/单重/单价，只清空名称与包数，下一条无需重复填写
      const sticky = rememberStickyValues(saved);
      setForm({ id: "", name: "", packages: 0, amount: 0, ...sticky });
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  };
  return (
    <Modal open title={isEditing ? "编辑原材料" : "添加原材料"} description="填写名称、规格、包数、单重(公斤/包)和单价(元/公斤)，总重量=包数×单重，金额=包数×单重×单价。添加后可连续录入下一条。" onClose={onClose}>
      <div className="form-grid">
        <label className="form-field"><span>名称<em>必填</em></span><input ref={nameInputRef} value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); if (nameError) setNameError(""); }} placeholder="例如：棉纱、橡筋" />{nameError ? <small style={{ color: "#e74c3c" }}>{nameError}</small> : null}</label>
        <label className="form-field"><span>规格</span><input value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} placeholder="例如：32支、40支" /></label>
        <label className="form-field"><span>采购人</span><input value={form.payer || ""} onChange={(e) => setForm({ ...form, payer: e.target.value })} placeholder="谁采购的" /></label>
        <label className="form-field"><span>包数</span><input type="number" step="1" min="0" value={form.packages || ""} onChange={(e) => { const p = Number(e.target.value) || 0; setForm({ ...form, packages: p, amount: calcAmount(p, form.weight, form.unitPrice) }); }} placeholder="包" /></label>
        <label className="form-field"><span>单重(公斤/包)</span><input type="number" step="0.01" value={form.weight || ""} onChange={(e) => { const w = Number(e.target.value) || 0; setForm({ ...form, weight: w, amount: calcAmount(Number(form.packages || 0), w, form.unitPrice) }); }} placeholder="公斤" /></label>
        <label className="form-field"><span>总重量(公斤)</span><input type="number" step="0.01" value={totalWeight.toFixed(2)} readOnly style={{ background: "#f5f5f5" }} placeholder="自动计算" /></label>
        <label className="form-field"><span>单价(元/公斤)</span><input type="number" step="0.01" value={form.unitPrice || ""} onChange={(e) => { const p = Number(e.target.value) || 0; setForm({ ...form, unitPrice: p, amount: calcAmount(Number(form.packages || 0), form.weight, p) }); }} placeholder="元/公斤" /></label>
        <label className="form-field"><span>金额(自动计算)</span><input type="number" step="0.01" value={form.amount || ""} readOnly style={{ background: "#f5f5f5" }} placeholder="自动计算" /></label>
      </div>
      <div style={{ marginTop: 12 }}>
        <span style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 6 }}>照片（可选）</span>
        <input type="file" accept="image/*" onChange={handlePhoto} style={{ marginBottom: 8 }} />
        {form.photo ? <div><img src={form.photo} alt="预览" style={{ maxWidth: 200, maxHeight: 150, borderRadius: 8, border: "1px solid #eee" }} /><br /><button type="button" onClick={() => setForm({ ...form, photo: undefined })} style={{ marginTop: 6, fontSize: 12, color: "#e74c3c", background: "none", border: "none", cursor: "pointer" }}>移除照片</button></div> : null}
      </div>
      <footer className="modal-actions">
        <Button variant="ghost" onClick={onClose}>取消</Button>
        <Button onClick={handleSave}>{isEditing ? "保存修改" : "保存并继续"}</Button>
      </footer>
    </Modal>
  );
}
