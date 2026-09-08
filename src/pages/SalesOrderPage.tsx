import { useEffect, useMemo, useState } from "react";
import { Plus, Trash, Calculator, Package } from "@phosphor-icons/react";
import { PageHeader, Section, Button, EmptyState, Badge } from "../components/ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

type SalesOrderItem = {
  id: string;
  customer: string;
  color: string;
  spec: "包" | "双";
  quantity: number;
  unitPrice: number;
  photo?: string;
};

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
    try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* ignore */ }
  }, [key, state]);
  return [state, setState];
}

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function SalesOrderPage() {
  const [items, setItems] = useLocalStorage<SalesOrderItem[]>("sock-erp-sales-order", []);
  const [draft, setDraft] = useState<SalesOrderItem>({ id: "", customer: "", color: "白色", spec: "双", quantity: 0, unitPrice: 0 });

  const handleDraftPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setDraft({ ...draft, photo: reader.result as string });
    reader.readAsDataURL(file);
  };

  // 从定型页读取已定型数量，作为可销货库存参考
  const dingxingItems = useMemo(() => {
    try {
      const raw = localStorage.getItem("sock-erp-dingxing");
      return raw ? (JSON.parse(raw) as Array<{ color: string; quantity: number; spec: string }>) : [];
    } catch {
      return [];
    }
  }, [items.length]); // items.length 作为依赖，添加/删除时刷新

  const dingxingByColor = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of dingxingItems) {
      map[item.color] = (map[item.color] ?? 0) + item.quantity;
    }
    return map;
  }, [dingxingItems]);

  const totalQty = useMemo(() => items.reduce((s, i) => s + i.quantity, 0), [items]);
  const totalAmount = useMemo(() => items.reduce((s, i) => s + i.quantity * i.unitPrice, 0), [items]);

  const allColors = useMemo(() => Array.from(new Set(["白色", "黑色", "灰色", "红色", "蓝色", "绿色", "黄色", "粉色", "紫色", "肤色", ...Object.keys(dingxingByColor)])), [dingxingByColor]);

  const addItem = () => {
    if (!draft.customer.trim()) return;
    setItems((prev) => [...prev, { ...draft, id: genId() }]);
    setDraft({ id: "", customer: "", color: "白色", spec: "双", quantity: 0, unitPrice: 0 });
  };

  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  return (
    <div>
      <PageHeader icon={<ModuleArtwork module="diet" />} eyebrow="销售管理" title="销货单" description="关联定型库存数量，开具销货单并自动合计。" actions={<Button onClick={addItem}><Plus size={16} />新增销货单</Button>} />

      <Section title="定型库存参考" description="来自定型页的已定型数量，销货时可对照">
        {Object.keys(dingxingByColor).length ? (
          <div className="stock-ref-row">
            {Object.entries(dingxingByColor).map(([color, qty]) => (
              <span key={color} className="stock-ref-chip"><Package size={14} />{color}：<strong>{qty}</strong></span>
            ))}
          </div>
        ) : (
          <p className="quiet-line">定型页暂无记录，销货数量不受限制。</p>
        )}
      </Section>

      <Section title="录入销货单" description="填写客户、颜色、规格、数量和单价，可上传照片">
        <div className="production-input-row">
          <input className="prod-input" placeholder="客户名称" value={draft.customer} onChange={(e) => setDraft({ ...draft, customer: e.target.value })} />
          <select className="prod-input" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })}>
            {allColors.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="prod-input" value={draft.spec} onChange={(e) => setDraft({ ...draft, spec: e.target.value as "包" | "双" })}>
            <option value="双">双</option>
            <option value="包">包</option>
          </select>
          <input className="prod-input prod-num" type="number" min="0" placeholder="数量" value={draft.quantity || ""} onChange={(e) => setDraft({ ...draft, quantity: Number(e.target.value) || 0 })} />
          <input className="prod-input prod-num" type="number" min="0" step="0.01" placeholder="单价" value={draft.unitPrice || ""} onChange={(e) => setDraft({ ...draft, unitPrice: Number(e.target.value) || 0 })} />
          <span className="prod-total-inline">¥{(draft.quantity * draft.unitPrice).toFixed(2)}</span>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 13, color: "#666" }}>
            <input type="file" accept="image/*" onChange={handleDraftPhoto} style={{ display: "none" }} />
            📷 {draft.photo ? "已选" : "照片"}
          </label>
          {draft.photo ? <img src={draft.photo} alt="预览" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6 }} /> : null}
          <Button onClick={addItem}><Plus size={16} />添加</Button>
        </div>
      </Section>

      {items.length ? (
        <Section title="销货单明细" description={`共 ${items.length} 条`}>
          <table className="prod-table">
            <thead><tr><th>照片</th><th>客户</th><th>颜色</th><th>规格</th><th>数量</th><th>单价</th><th>合计</th><th>操作</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.photo ? <img src={item.photo} alt={item.customer} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }} /> : <span style={{ color: "#999", fontSize: 12 }}>无</span>}</td>
                  <td>{item.customer}</td>
                  <td><Badge tone="accent">{item.color}</Badge></td>
                  <td>{item.spec}</td>
                  <td>{item.quantity}</td>
                  <td>¥{item.unitPrice.toFixed(2)}</td>
                  <td><strong>¥{(item.quantity * item.unitPrice).toFixed(2)}</strong></td>
                  <td><button className="icon-button danger-text" title="删除" onClick={() => removeItem(item.id)}><Trash size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="prod-summary prod-grand"><span><Calculator size={18} />销货总数：<strong>{totalQty}</strong></span><span>销货总额：<strong>¥{totalAmount.toFixed(2)}</strong></span></div>
        </Section>
      ) : (
        <EmptyState title="还没有销货单" description="在上方填写客户信息后点击添加。" />
      )}
    </div>
  );
}
