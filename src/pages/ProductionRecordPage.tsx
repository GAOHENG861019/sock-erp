import { useEffect, useMemo, useState } from "react";
import { Plus, Trash, Calculator } from "@phosphor-icons/react";
import { PageHeader, Section, Button, EmptyState } from "../components/ui";
import { ModuleArtwork, type ModuleArtworkName } from "../components/ModuleArtwork";

export type ProductionItem = {
  id: string;
  name: string;
  spec: "包" | "双";
  quantity: number;
  unitPrice: number;
};

const COLORS = ["白色", "黑色", "灰色", "红色", "蓝色", "绿色", "黄色", "粉色", "紫色", "肤色"];

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

/** 翻袜 / 缝头 通用生产记录页 —— 按姓名分组计算 */
export function ProductionRecordPage({
  eyebrow,
  title,
  description,
  module,
  storageKey,
}: {
  eyebrow: string;
  title: string;
  description: string;
  module: ModuleArtworkName;
  storageKey: string;
}) {
  const [items, setItems] = useLocalStorage<ProductionItem[]>(storageKey, []);
  const [draft, setDraft] = useState<ProductionItem>({ id: "", name: "", spec: "双", quantity: 0, unitPrice: 0 });

  const nameGroups = useMemo(() => {
    const groups: Record<string, ProductionItem[]> = {};
    for (const item of items) {
      (groups[item.name] ??= []).push(item);
    }
    return groups;
  }, [items]);

  const grandTotalQty = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);
  const grandTotalAmount = useMemo(() => items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0), [items]);

  const addItem = () => {
    if (!draft.name.trim()) return;
    setItems((prev) => [...prev, { ...draft, id: genId() }]);
    setDraft({ id: "", name: "", spec: "双", quantity: 0, unitPrice: 0 });
  };

  const removeItem = (id: string) => setItems((prev) => prev.filter((item) => item.id !== id));

  return (
    <div>
      <PageHeader icon={<ModuleArtwork module={module} />} eyebrow={eyebrow} title={title} description={description} />
      <Section title="录入记录" description="填写姓名、规格、数量和单价，合计自动计算">
        <div className="production-input-row">
          <input className="prod-input" placeholder="姓名" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <select className="prod-input" value={draft.spec} onChange={(e) => setDraft({ ...draft, spec: e.target.value as "包" | "双" })}>
            <option value="双">双</option>
            <option value="包">包</option>
          </select>
          <input className="prod-input prod-num" type="number" min="0" placeholder="数量" value={draft.quantity || ""} onChange={(e) => setDraft({ ...draft, quantity: Number(e.target.value) || 0 })} />
          <input className="prod-input prod-num" type="number" min="0" step="0.01" placeholder="单价" value={draft.unitPrice || ""} onChange={(e) => setDraft({ ...draft, unitPrice: Number(e.target.value) || 0 })} />
          <span className="prod-total-inline">¥{(draft.quantity * draft.unitPrice).toFixed(2)}</span>
          <Button onClick={addItem}><Plus size={16} />添加</Button>
        </div>
      </Section>
      {items.length ? (
        <>
          {Object.entries(nameGroups).map(([name, nameItems]) => {
            const subQty = nameItems.reduce((s, i) => s + i.quantity, 0);
            const subAmount = nameItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
            return (
              <Section key={name} title={`姓名：${name}`} description={`${nameItems.length} 条记录`}>
                <table className="prod-table">
                  <thead><tr><th>规格</th><th>数量</th><th>单价</th><th>合计</th><th>操作</th></tr></thead>
                  <tbody>
                    {nameItems.map((item) => (
                      <tr key={item.id}>
                        <td>{item.spec}</td>
                        <td>{item.quantity}</td>
                        <td>¥{item.unitPrice.toFixed(2)}</td>
                        <td><strong>¥{(item.quantity * item.unitPrice).toFixed(2)}</strong></td>
                        <td><button className="icon-button danger-text" title="删除" onClick={() => removeItem(item.id)}><Trash size={16} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="prod-summary"><span>本人小计数量：<strong>{subQty}</strong></span><span>本人小计金额：<strong>¥{subAmount.toFixed(2)}</strong></span></div>
              </Section>
            );
          })}
          <Section title="总数汇总">
            <div className="prod-summary prod-grand"><span><Calculator size={20} />总数量：<strong>{grandTotalQty}</strong></span><span>总金额：<strong>¥{grandTotalAmount.toFixed(2)}</strong></span></div>
          </Section>
        </>
      ) : (
        <EmptyState title="还没有记录" description="在上方填写信息后点击添加。" />
      )}
    </div>
  );
}

/** 定型页：按颜色分组，每个颜色单独合计，最后显示定型总数 */
export function DingxingPage({ module }: { module: ModuleArtworkName }) {
  const [items, setItems] = useLocalStorage<(ProductionItem & { color: string })[]>("sock-erp-dingxing", []);
  const [draft, setDraft] = useState<ProductionItem & { color: string }>({ id: "", name: "", color: "白色", spec: "双", quantity: 0, unitPrice: 0 });
  const [customColor, setCustomColor] = useState("");

  const colorGroups = useMemo(() => {
    const groups: Record<string, (ProductionItem & { color: string })[]> = {};
    for (const item of items) {
      (groups[item.color] ??= []).push(item);
    }
    return groups;
  }, [items]);

  const grandTotalQty = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);
  const grandTotalAmount = useMemo(() => items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0), [items]);

  const addItem = () => {
    if (!draft.name.trim()) return;
    setItems((prev) => [...prev, { ...draft, id: genId() }]);
    setDraft({ id: "", name: "", color: "白色", spec: "双", quantity: 0, unitPrice: 0 });
  };

  const removeItem = (id: string) => setItems((prev) => prev.filter((item) => item.id !== id));

  const allColors = useMemo(() => Array.from(new Set([...COLORS, ...items.map((i) => i.color)])), [items]);

  return (
    <div>
      <PageHeader icon={<ModuleArtwork module={module} />} eyebrow="生产工序" title="定型" description="按颜色分组记录定型数量，每个颜色单独合计，最后汇总定型总数。" />
      <Section title="录入记录" description="选择颜色或姓名，填写规格、数量和单价">
        <div className="production-input-row">
          <input className="prod-input" placeholder="姓名" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <select className="prod-input" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })}>
            {allColors.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className="prod-input" placeholder="自定义颜色" value={customColor} onChange={(e) => setCustomColor(e.target.value)} onBlur={() => { if (customColor.trim()) { setDraft({ ...draft, color: customColor.trim() }); setCustomColor(""); } }} />
          <select className="prod-input" value={draft.spec} onChange={(e) => setDraft({ ...draft, spec: e.target.value as "包" | "双" })}>
            <option value="双">双</option>
            <option value="包">包</option>
          </select>
          <input className="prod-input prod-num" type="number" min="0" placeholder="数量" value={draft.quantity || ""} onChange={(e) => setDraft({ ...draft, quantity: Number(e.target.value) || 0 })} />
          <input className="prod-input prod-num" type="number" min="0" step="0.01" placeholder="单价" value={draft.unitPrice || ""} onChange={(e) => setDraft({ ...draft, unitPrice: Number(e.target.value) || 0 })} />
          <Button onClick={addItem}><Plus size={16} />添加</Button>
        </div>
      </Section>
      {items.length ? (
        <>
          {Object.entries(colorGroups).map(([color, colorItems]) => {
            const subQty = colorItems.reduce((s, i) => s + i.quantity, 0);
            const subAmount = colorItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
            return (
              <Section key={color} title={`颜色：${color}`} description={`${colorItems.length} 条记录`}>
                <table className="prod-table">
                  <thead><tr><th>姓名</th><th>规格</th><th>数量</th><th>单价</th><th>合计</th><th>操作</th></tr></thead>
                  <tbody>
                    {colorItems.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.spec}</td>
                        <td>{item.quantity}</td>
                        <td>¥{item.unitPrice.toFixed(2)}</td>
                        <td><strong>¥{(item.quantity * item.unitPrice).toFixed(2)}</strong></td>
                        <td><button className="icon-button danger-text" title="删除" onClick={() => removeItem(item.id)}><Trash size={16} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="prod-summary"><span>颜色小计数量：<strong>{subQty}</strong></span><span>颜色小计金额：<strong>¥{subAmount.toFixed(2)}</strong></span></div>
              </Section>
            );
          })}
          <Section title="定型总数汇总">
            <div className="prod-summary prod-grand"><span><Calculator size={20} />定型总数：<strong>{grandTotalQty}</strong></span><span>总金额：<strong>¥{grandTotalAmount.toFixed(2)}</strong></span></div>
          </Section>
        </>
      ) : (
        <EmptyState title="还没有定型记录" description="在上方选择颜色并填写信息后点击添加。" />
      )}
    </div>
  );
}
