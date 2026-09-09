import { useEffect, useMemo, useState } from "react";
import { Plus, Trash, Calculator } from "@phosphor-icons/react";
import { PageHeader, Section, Button, EmptyState } from "../components/ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

/** 仓库管理：添加商品（简单商品录入） */
export function WarehousePage() {
  const [items, setItems] = useState<Array<{ id: string; name: string; spec: string; quantity: number; unitPrice: number }>>(() => {
    try { const raw = localStorage.getItem("sock-erp-warehouse-products"); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const [draft, setDraft] = useState({ id: "", name: "", spec: "", quantity: 0, unitPrice: 0 });
  useEffect(() => { try { localStorage.setItem("sock-erp-warehouse-products", JSON.stringify(items)); } catch { /* ignore */ } }, [items]);
  const total = useMemo(() => items.reduce((s, i) => s + i.quantity * i.unitPrice, 0), [items]);
  const totalQty = useMemo(() => items.reduce((s, i) => s + i.quantity, 0), [items]);
  const addItem = () => {
    if (!draft.name.trim()) return;
    setItems((prev) => [...prev, { ...draft, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }]);
    setDraft({ id: "", name: "", spec: "", quantity: 0, unitPrice: 0 });
  };
  return (
    <div>
      <PageHeader icon={<ModuleArtwork module="consulting" />} eyebrow="仓库与商品" title="仓库管理" description="添加和管理仓库商品，自动合计库存数量和金额。" actions={<Button onClick={addItem}><Plus size={17} />添加商品</Button>} />
      <Section title="录入商品" description="填写商品名称、规格、数量和单价">
        <div className="production-input-row">
          <input className="prod-input" placeholder="商品名称" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input className="prod-input" placeholder="规格" value={draft.spec} onChange={(e) => setDraft({ ...draft, spec: e.target.value })} />
          <input className="prod-input prod-num" type="number" min="0" placeholder="数量" value={draft.quantity || ""} onChange={(e) => setDraft({ ...draft, quantity: Number(e.target.value) || 0 })} />
          <input className="prod-input prod-num" type="number" min="0" step="0.01" placeholder="单价" value={draft.unitPrice || ""} onChange={(e) => setDraft({ ...draft, unitPrice: Number(e.target.value) || 0 })} />
          <span className="prod-total-inline">¥{(draft.quantity * draft.unitPrice).toFixed(2)}</span>
          <Button onClick={addItem}><Plus size={16} />添加</Button>
        </div>
      </Section>
      {items.length ? (
        <Section title="商品库存" description={`共 ${items.length} 种商品`}>
          <table className="prod-table">
            <thead><tr><th>商品名称</th><th>规格</th><th>库存数量</th><th>单价</th><th>库存金额</th><th>操作</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong></td>
                  <td>{item.spec || "-"}</td>
                  <td>{item.quantity}</td>
                  <td>¥{item.unitPrice.toFixed(2)}</td>
                  <td>¥{(item.quantity * item.unitPrice).toFixed(2)}</td>
                  <td><button className="icon-button danger-text" title="删除" onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}><Trash size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="prod-summary prod-grand"><span><Calculator size={18} />库存总数：<strong>{totalQty}</strong></span><span>库存总金额：<strong>¥{total.toFixed(2)}</strong></span></div>
        </Section>
      ) : <EmptyState title="仓库还没有商品" description="在上方填写商品信息后点击添加。" />}
    </div>
  );
}
