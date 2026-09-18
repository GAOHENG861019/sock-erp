import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash, Calculator, Pencil, X, ArrowCounterClockwise } from "@phosphor-icons/react";
import { PageHeader, Section, Button, EmptyState, Modal } from "../components/ui";
import { ModuleArtwork, type ModuleArtworkName } from "../components/ModuleArtwork";

export type ProductionItem = {
  id: string;
  name: string;
  color?: string;
  spec: "包" | "双";
  quantity: number;
  unitPrice: number;
  date?: string;
};

const COLORS = ["白色", "黑色", "灰色", "红色", "蓝色", "绿色", "黄色", "粉色", "紫色", "肤色"];

function useLocalStorage<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return initial;
      const parsed = JSON.parse(raw) as T;
      // 确保数组类型正确（防止旧数据格式不匹配）
      if (Array.isArray(initial) && !Array.isArray(parsed)) return initial;
      return parsed;
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

/** 按规格汇总数量 */
function sumBySpec(items: ProductionItem[]) {
  const shuang = items.filter((i) => i.spec === "双").reduce((s, i) => s + i.quantity, 0);
  const bao = items.filter((i) => i.spec === "包").reduce((s, i) => s + i.quantity, 0);
  const parts: string[] = [];
  if (shuang) parts.push(`${shuang}双`);
  if (bao) parts.push(`${bao}包`);
  return parts.length ? parts.join(" + ") : "0";
}

/** 翻袜 / 缝头 通用生产记录页 —— 按姓名分组计算，数量按规格(双/包)计算 */
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
  const [deletedItems, setDeletedItems] = useLocalStorage<ProductionItem[]>(storageKey + "-trash", []);
  const [showTrash, setShowTrash] = useState(false);
  const [draft, setDraft] = useState<ProductionItem>({ id: "", name: "", color: "白色", spec: "包", quantity: 0, unitPrice: 0, date: new Date().toISOString().slice(0, 10) });
  const [editing, setEditing] = useState<ProductionItem | null>(null);
  const [longPressId, setLongPressId] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleLongPressStart = (id: string) => {
    longPressTimer.current = setTimeout(() => {
      setLongPressId(id);
      if (navigator.vibrate) navigator.vibrate(50);
    }, 500);
  };
  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const confirmLongPressDelete = (id: string) => {
    removeItem(id);
    setLongPressId(null);
  };

  const nameGroups = useMemo(() => {
    const groups: Record<string, ProductionItem[]> = {};
    for (const item of items) {
      (groups[item.name] ??= []).push(item);
    }
    return groups;
  }, [items]);

  const grandTotalAmount = useMemo(() => items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0), [items]);

  const addItem = () => {
    if (!draft.name.trim()) return;
    setItems((prev) => [...prev, { ...draft, id: genId() }]);
    setDraft({ id: "", name: "", color: "白色", spec: "包", quantity: 0, unitPrice: 0, date: new Date().toISOString().slice(0, 10) });
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const removeItem = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (item) {
      setDeletedItems((prev) => [...prev, item]);
      setItems((prev) => prev.filter((i) => i.id !== id));
    }
  };

  const restoreItem = (id: string) => {
    const item = deletedItems.find((i) => i.id === id);
    if (item) {
      setItems((prev) => [...prev, item]);
      setDeletedItems((prev) => prev.filter((i) => i.id !== id));
    }
  };

  const permanentDelete = (id: string) => setDeletedItems((prev) => prev.filter((i) => i.id !== id));

  const saveEdit = () => {
    if (!editing || !editing.name.trim()) return;
    setItems((prev) => prev.map((item) => item.id === editing.id ? editing : item));
    setEditing(null);
  };

  return (
    <div>
      <PageHeader icon={<ModuleArtwork module={module} />} eyebrow={eyebrow} title={title} description={description} />
      <Section title="录入记录" description="填写日期、姓名、颜色、数量和单价，合计自动计算">
        <div className="production-input-row">
          <input className="prod-input" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          <input ref={nameInputRef} className="prod-input" placeholder="姓名" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <select className="prod-input" value={draft.color || "白色"} onChange={(e) => setDraft({ ...draft, color: e.target.value })}>
            {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className="prod-input prod-num" type="number" min="0" placeholder="数量(包)" value={draft.quantity || ""} onChange={(e) => setDraft({ ...draft, quantity: Number(e.target.value) || 0 })} />
          <input className="prod-input prod-num" type="number" min="0" step="0.01" placeholder="单价(元/包)" value={draft.unitPrice || ""} onChange={(e) => setDraft({ ...draft, unitPrice: Number(e.target.value) || 0 })} />
          <span className="prod-total-inline">¥{(draft.quantity * draft.unitPrice).toFixed(2)}</span>
          <Button onClick={addItem}><Plus size={16} />添加</Button>
        </div>
      </Section>
      {items.length ? (
        <>
          {Object.entries(nameGroups).map(([name, nameItems]) => {
            const subAmount = nameItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
            return (
              <Section key={name} title={`姓名：${name}`} description={`${nameItems.length} 条记录`}>
                <table className="prod-table">
                  <thead><tr><th>日期</th><th>颜色</th><th>数量</th><th>单价</th><th>合计</th><th>操作</th></tr></thead>
                  <tbody>
                    {nameItems.map((item) => (
                      <tr key={item.id}
                          className={longPressId === item.id ? "long-press-active" : ""}
                          onTouchStart={() => handleLongPressStart(item.id)}
                          onTouchEnd={handleLongPressEnd}
                          onTouchMove={handleLongPressEnd}
                          onMouseDown={() => handleLongPressStart(item.id)}
                          onMouseUp={handleLongPressEnd}
                          onMouseLeave={handleLongPressEnd}
                          style={{ cursor: "pointer", userSelect: "none", WebkitUserSelect: "none" }}>
                        <td>{item.date || "-"}</td>
                        <td>{item.color || "-"}</td>
                        <td>{item.quantity} 包</td>
                        <td>¥{item.unitPrice.toFixed(2)}/包</td>
                        <td><strong>¥{(item.quantity * item.unitPrice).toFixed(2)}</strong></td>
                        <td>
                          <button className="icon-button" title="编辑" onClick={(e) => { e.stopPropagation(); setEditing({ ...item }); }}><Pencil size={16} /></button>
                          <button className="icon-button danger-text" title="删除" onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}><Trash size={16} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="prod-summary"><span>本人小计数量：<strong>{nameItems.reduce((s, i) => s + i.quantity, 0)}包</strong></span><span>本人小计金额：<strong>¥{subAmount.toFixed(2)}</strong></span></div>
              </Section>
            );
          })}
          <Section title="总数汇总">
            <div className="prod-summary prod-grand"><span><Calculator size={20} />总数量：<strong>{items.reduce((s, i) => s + i.quantity, 0)}包</strong></span><span>总金额：<strong>¥{grandTotalAmount.toFixed(2)}</strong></span></div>
          </Section>
        </>
      ) : (
        <EmptyState title="还没有记录" description="在上方填写信息后点击添加。" />
      )}

      {/* 回收站 */}
      {deletedItems.length > 0 && (
        <Section title={`已删除记录 (${deletedItems.length})`} description="可恢复或永久删除">
          <button className="link-button" onClick={() => setShowTrash(!showTrash)} style={{ marginBottom: 12 }}>
            {showTrash ? "收起" : "展开"}已删除记录
          </button>
          {showTrash && (
            <table className="prod-table">
              <thead><tr><th>日期</th><th>姓名</th><th>颜色</th><th>数量</th><th>单价</th><th>操作</th></tr></thead>
              <tbody>
                {deletedItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.date || "-"}</td>
                    <td>{item.name}</td>
                    <td>{item.color || "-"}</td>
                    <td>{item.quantity} 包</td>
                    <td>¥{item.unitPrice.toFixed(2)}/包</td>
                    <td>
                      <button className="icon-button" title="恢复" onClick={() => restoreItem(item.id)}><ArrowCounterClockwise size={16} /></button>
                      <button className="icon-button danger-text" title="永久删除" onClick={() => permanentDelete(item.id)}><Trash size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      )}

      {/* 编辑弹窗 */}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title="编辑记录">
        {editing && (
          <div className="form-grid">
            <label className="form-field"><span>日期</span><input type="date" value={editing.date || ""} onChange={(e) => setEditing({ ...editing, date: e.target.value })} /></label>
            <label className="form-field"><span>姓名</span><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
            <label className="form-field"><span>颜色</span>
              <select value={editing.color || "白色"} onChange={(e) => setEditing({ ...editing, color: e.target.value })}>
                {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="form-field"><span>数量</span><input type="number" min="0" value={editing.quantity || ""} onChange={(e) => setEditing({ ...editing, quantity: Number(e.target.value) || 0 })} /></label>
            <label className="form-field"><span>单价(元/包)</span><input type="number" min="0" step="0.01" value={editing.unitPrice || ""} onChange={(e) => setEditing({ ...editing, unitPrice: Number(e.target.value) || 0 })} /></label>
            <div style={{ gridColumn: "1 / -1", fontSize: 14, color: "#666" }}>合计：¥{(editing.quantity * editing.unitPrice).toFixed(2)}</div>
          </div>
        )}
        <footer className="modal-actions">
          <Button variant="ghost" onClick={() => setEditing(null)}><X size={16} />取消</Button>
          <Button onClick={saveEdit}>保存修改</Button>
        </footer>
      </Modal>

      {/* 长按删除确认弹窗 */}
      <Modal open={longPressId !== null} onClose={() => setLongPressId(null)} title="删除记录">
        <p>确定要删除这条记录吗？删除后可在回收站恢复。</p>
        <footer className="modal-actions">
          <Button variant="ghost" onClick={() => setLongPressId(null)}><X size={16} />取消</Button>
          <Button className="danger" onClick={() => longPressId && confirmLongPressDelete(longPressId)}><Trash size={16} />删除</Button>
        </footer>
      </Modal>
    </div>
  );
}

/** 定型页：按颜色分组，每个颜色单独合计，数量按规格(双/包)计算 */
export function DingxingPage({ module }: { module: ModuleArtworkName }) {
  const [items, setItems] = useLocalStorage<(ProductionItem & { color: string })[]>("sock-erp-dingxing", []);
  const [deletedItems, setDeletedItems] = useLocalStorage<(ProductionItem & { color: string })[]>("sock-erp-dingxing-trash", []);
  const [showTrash, setShowTrash] = useState(false);
  const [draft, setDraft] = useState<ProductionItem & { color: string }>({ id: "", name: "", color: "白色", spec: "包", quantity: 0, unitPrice: 0, date: new Date().toISOString().slice(0, 10) });
  const [customColor, setCustomColor] = useState("");
  const [editing, setEditing] = useState<(ProductionItem & { color: string }) | null>(null);
  const dxNameInputRef = useRef<HTMLInputElement>(null);

  const colorGroups = useMemo(() => {
    const groups: Record<string, (ProductionItem & { color: string })[]> = {};
    for (const item of items) {
      (groups[item.color] ??= []).push(item);
    }
    return groups;
  }, [items]);

  const grandTotalAmount = useMemo(() => items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0), [items]);

  const addItem = () => {
    if (!draft.name.trim()) return;
    setItems((prev) => [...prev, { ...draft, id: genId() }]);
    setDraft({ id: "", name: "", color: "白色", spec: "包", quantity: 0, unitPrice: 0, date: new Date().toISOString().slice(0, 10) });
    setTimeout(() => dxNameInputRef.current?.focus(), 0);
  };

  const removeItem = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (item) {
      setDeletedItems((prev) => [...prev, item]);
      setItems((prev) => prev.filter((i) => i.id !== id));
    }
  };

  const restoreItem = (id: string) => {
    const item = deletedItems.find((i) => i.id === id);
    if (item) {
      setItems((prev) => [...prev, item]);
      setDeletedItems((prev) => prev.filter((i) => i.id !== id));
    }
  };

  const permanentDelete = (id: string) => setDeletedItems((prev) => prev.filter((i) => i.id !== id));

  const saveEdit = () => {
    if (!editing || !editing.name.trim()) return;
    setItems((prev) => prev.map((item) => item.id === editing.id ? editing : item));
    setEditing(null);
  };

  const [dxLongPressId, setDxLongPressId] = useState<string | null>(null);
  const dxLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dxHandleLongPressStart = (id: string) => {
    dxLongPressTimer.current = setTimeout(() => {
      setDxLongPressId(id);
      if (navigator.vibrate) navigator.vibrate(50);
    }, 500);
  };
  const dxHandleLongPressEnd = () => {
    if (dxLongPressTimer.current) {
      clearTimeout(dxLongPressTimer.current);
      dxLongPressTimer.current = null;
    }
  };
  const dxConfirmDelete = (id: string) => {
    removeItem(id);
    setDxLongPressId(null);
  };

  const allColors = useMemo(() => Array.from(new Set([...COLORS, ...items.map((i) => i.color)])), [items]);

  return (
    <div>
      <PageHeader icon={<ModuleArtwork module={module} />} eyebrow="生产工序" title="定型" description="按颜色分组记录定型数量，每个颜色单独合计，数量按包计算。" />
      <Section title="录入记录" description="选择颜色或姓名，填写日期、数量和单价">
        <div className="production-input-row">
          <input className="prod-input" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          <input ref={dxNameInputRef} className="prod-input" placeholder="姓名" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <select className="prod-input" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })}>
            {allColors.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className="prod-input" placeholder="自定义颜色" value={customColor} onChange={(e) => setCustomColor(e.target.value)} onBlur={() => { if (customColor.trim()) { setDraft({ ...draft, color: customColor.trim() }); setCustomColor(""); } }} />
          <input className="prod-input prod-num" type="number" min="0" placeholder="数量(包)" value={draft.quantity || ""} onChange={(e) => setDraft({ ...draft, quantity: Number(e.target.value) || 0 })} />
          <input className="prod-input prod-num" type="number" min="0" step="0.01" placeholder="单价(元/包)" value={draft.unitPrice || ""} onChange={(e) => setDraft({ ...draft, unitPrice: Number(e.target.value) || 0 })} />
          <Button onClick={addItem}><Plus size={16} />添加</Button>
        </div>
      </Section>
      {items.length ? (
        <>
          {Object.entries(colorGroups).map(([color, colorItems]) => {
            const subAmount = colorItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
            return (
              <Section key={color} title={`颜色：${color}`} description={`${colorItems.length} 条记录`}>
                <table className="prod-table">
                  <thead><tr><th>日期</th><th>姓名</th><th>数量</th><th>单价</th><th>合计</th><th>操作</th></tr></thead>
                  <tbody>
                    {colorItems.map((item) => (
                      <tr key={item.id}
                          className={dxLongPressId === item.id ? "long-press-active" : ""}
                          onTouchStart={() => dxHandleLongPressStart(item.id)}
                          onTouchEnd={dxHandleLongPressEnd}
                          onTouchMove={dxHandleLongPressEnd}
                          onMouseDown={() => dxHandleLongPressStart(item.id)}
                          onMouseUp={dxHandleLongPressEnd}
                          onMouseLeave={dxHandleLongPressEnd}
                          style={{ cursor: "pointer", userSelect: "none", WebkitUserSelect: "none" }}>
                        <td>{item.date || "-"}</td>
                        <td>{item.name}</td>
                        <td>{item.quantity} 包</td>
                        <td>¥{item.unitPrice.toFixed(2)}/包</td>
                        <td><strong>¥{(item.quantity * item.unitPrice).toFixed(2)}</strong></td>
                        <td>
                          <button className="icon-button" title="编辑" onClick={(e) => { e.stopPropagation(); setEditing({ ...item }); }}><Pencil size={16} /></button>
                          <button className="icon-button danger-text" title="删除" onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}><Trash size={16} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="prod-summary"><span>颜色小计数量：<strong>{colorItems.reduce((s, i) => s + i.quantity, 0)}包</strong></span><span>颜色小计金额：<strong>¥{subAmount.toFixed(2)}</strong></span></div>
              </Section>
            );
          })}
          <Section title="定型总数汇总">
            <div className="prod-summary prod-grand"><span><Calculator size={20} />定型总数：<strong>{items.reduce((s, i) => s + i.quantity, 0)}包</strong></span><span>总金额：<strong>¥{grandTotalAmount.toFixed(2)}</strong></span></div>
          </Section>
        </>
      ) : (
        <EmptyState title="还没有定型记录" description="在上方选择颜色并填写信息后点击添加。" />
      )}

      {/* 回收站 */}
      {deletedItems.length > 0 && (
        <Section title={`已删除记录 (${deletedItems.length})`} description="可恢复或永久删除">
          <button className="link-button" onClick={() => setShowTrash(!showTrash)} style={{ marginBottom: 12 }}>
            {showTrash ? "收起" : "展开"}已删除记录
          </button>
          {showTrash && (
            <table className="prod-table">
              <thead><tr><th>日期</th><th>姓名</th><th>颜色</th><th>数量</th><th>操作</th></tr></thead>
              <tbody>
                {deletedItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.date || "-"}</td>
                    <td>{item.name}</td>
                    <td>{item.color}</td>
                    <td>{item.quantity} 包</td>
                    <td>
                      <button className="icon-button" title="恢复" onClick={() => restoreItem(item.id)}><ArrowCounterClockwise size={16} /></button>
                      <button className="icon-button danger-text" title="永久删除" onClick={() => permanentDelete(item.id)}><Trash size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      )}

      {/* 编辑弹窗 */}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title="编辑定型记录">
        {editing && (
          <div className="form-grid">
            <label className="form-field"><span>日期</span><input type="date" value={editing.date || ""} onChange={(e) => setEditing({ ...editing, date: e.target.value })} /></label>
            <label className="form-field"><span>姓名</span><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
            <label className="form-field"><span>颜色</span>
              <select value={editing.color} onChange={(e) => setEditing({ ...editing, color: e.target.value })}>
                {allColors.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="form-field"><span>数量</span><input type="number" min="0" value={editing.quantity || ""} onChange={(e) => setEditing({ ...editing, quantity: Number(e.target.value) || 0 })} /></label>
            <label className="form-field"><span>单价(元/包)</span><input type="number" min="0" step="0.01" value={editing.unitPrice || ""} onChange={(e) => setEditing({ ...editing, unitPrice: Number(e.target.value) || 0 })} /></label>
            <div style={{ gridColumn: "1 / -1", fontSize: 14, color: "#666" }}>合计：¥{(editing.quantity * editing.unitPrice).toFixed(2)}</div>
          </div>
        )}
        <footer className="modal-actions">
          <Button variant="ghost" onClick={() => setEditing(null)}><X size={16} />取消</Button>
          <Button onClick={saveEdit}>保存修改</Button>
        </footer>
      </Modal>

      {/* 长按删除确认弹窗 */}
      <Modal open={dxLongPressId !== null} onClose={() => setDxLongPressId(null)} title="删除记录">
        <p>确定要删除这条定型记录吗？删除后可在回收站恢复。</p>
        <footer className="modal-actions">
          <Button variant="ghost" onClick={() => setDxLongPressId(null)}><X size={16} />取消</Button>
          <Button className="danger" onClick={() => dxLongPressId && dxConfirmDelete(dxLongPressId)}><Trash size={16} />删除</Button>
        </footer>
      </Modal>
    </div>
  );
}
