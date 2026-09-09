import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, ArrowCounterClockwise, FloppyDisk, Package, Trash } from "@phosphor-icons/react";
import { api } from "../api";
import { useWorkspace } from "../WorkspaceContext";
import { localDate } from "../utils";
import { Badge, Button, EmptyState, EntityForm, Modal, PageHeader, Section, type FieldDefinition } from "../components/ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

type DingxingItem = {
  id: string;
  name: string;
  color: string;
  spec: string;
  quantity: number;
  unitPrice: number;
};

type RawMaterialItem = {
  id: string;
  name: string;
  spec: string;
  weight: number;
  unitPrice: number;
  amount: number;
};

export function DietPage() {
  const { data, run, saveNow } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<{ type: string; item?: Record<string, any> } | null>(null);
  const lastCreated = useRef<{ collection: string; id: string } | null>(null);
  useEffect(() => { const value = params.get("new"); if (value) setDialog({ type: value }); }, [params]);
  const close = () => { setDialog(null); setParams({}); };

  const rawMaterials = useMemo<RawMaterialItem[]>(() => { try { const raw = localStorage.getItem("sock-erp-raw-materials"); return raw ? JSON.parse(raw) : []; } catch { return []; } }, []);
  const rawTotal = rawMaterials.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);

  const dingxing = useMemo<DingxingItem[]>(() => {
    try {
      const raw = localStorage.getItem("sock-erp-dingxing");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }, []);

  // 成品按颜色分组
  const dingxingByColor = useMemo(() => {
    const groups: Record<string, DingxingItem[]> = {};
    for (const item of dingxing) {
      const key = item.color || "未分组";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return groups;
  }, [dingxing]);

  const colorSummary = useMemo(() => {
    const result: { color: string; list: DingxingItem[]; shuang: number; bao: number; amount: number }[] = [];
    for (const [color, list] of Object.entries(dingxingByColor)) {
      let shuang = 0;
      let bao = 0;
      let amount = 0;
      for (const item of list) {
        const qty = Number(item.quantity || 0);
        const sub = qty * Number(item.unitPrice || 0);
        amount += sub;
        if (item.spec === "双") shuang += qty;
        else if (item.spec === "包") bao += qty;
      }
      result.push({ color, list, shuang, bao, amount });
    }
    return result;
  }, [dingxingByColor]);

  const finishedTotal = useMemo(() => {
    let qty = 0;
    let amount = 0;
    for (const c of colorSummary) { qty += c.shuang + c.bao; amount += c.amount; }
    return { qty, amount };
  }, [colorSummary]);

  // 原材料汇总
  const rawSummary = useMemo(() => {
    let weight = 0;
    let amount = 0;
    for (const r of rawMaterials) {
      weight += Number(r.weight || 0);
      amount += Number(r.amount || 0);
    }
    return { weight, amount };
  }, [rawMaterials]);

  const undoLast = async () => {
    if (!lastCreated.current) return;
    const { collection, id } = lastCreated.current;
    await run(() => api.remove(collection as any, id));
    lastCreated.current = null;
  };

  return (
    <div>
      <PageHeader icon={<ModuleArtwork module="diet" />} eyebrow="盘点与实际库存" title="库存盘点" description="关联仓库管理与原材料采购，维护盘点物品清单。" actions={<><Button variant="secondary" onClick={() => void saveNow().catch(() => undefined)}><FloppyDisk size={16} />保存</Button><Button onClick={() => void undoLast()}><ArrowCounterClockwise size={17} />撤销</Button></>} />
      <Section title="关联数据" description="自动关联仓库管理与原材料采购">
        <div className="linked-data-grid">
          <div className="linked-card"><div className="linked-head"><Package size={18} /><strong>仓库管理</strong></div><p>客户：{data.clients.length} 个 · 仓库项目：{data.consultingProjects.length} 个 · 出入库记录：{data.consultingInteractions.length} 条</p></div>
          <div className="linked-card"><div className="linked-head"><Package size={18} /><strong>原材料采购</strong></div><p>原材料：{rawMaterials.length} 种 · 总额度：¥{rawTotal.toFixed(2)}</p>{rawMaterials.length ? <div className="raw-mini-list">{rawMaterials.slice(0, 5).map((r: any) => <span key={r.id}>{r.name} ({r.weight}kg)</span>)}</div> : null}</div>
        </div>
      </Section>

      <Section title="成品库存（关联定型）" description="按颜色与规格汇总定型数据">
        {colorSummary.length ? (
          <div className="finished-group-list">
            {colorSummary.map(({ color, list, shuang, bao, amount }) => (
              <div key={color} className="finished-color-group">
                <div className="finished-color-head">
                  <strong className="finished-color-name">{color}</strong>
                  <span className="finished-color-summary">
                    {shuang ? `${shuang}双` : ""}{shuang && bao ? " + " : ""}{bao ? `${bao}包` : ""}
                    {" · 小计 ¥" + amount.toFixed(2)}
                  </span>
                </div>
                <table className="prod-table">
                  <thead>
                    <tr><th>姓名</th><th>规格</th><th>数量</th><th>单价</th><th>合计金额</th></tr>
                  </thead>
                  <tbody>
                    {list.map((item) => {
                      const sub = Number(item.quantity || 0) * Number(item.unitPrice || 0);
                      return (
                        <tr key={item.id}>
                          <td><strong>{item.name}</strong></td>
                          <td>{item.spec}</td>
                          <td>{item.quantity}</td>
                          <td>¥{Number(item.unitPrice || 0).toFixed(2)}</td>
                          <td>¥{sub.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
            <div className="finished-grand-total">
              <strong>成品总计：</strong>
              <span>总数量 {finishedTotal.qty} · 总金额 ¥{finishedTotal.amount.toFixed(2)}</span>
            </div>
          </div>
        ) : (
          <EmptyState title="暂无成品库存数据" description="完成定型登记后，此处会按颜色汇总成品库存。" />
        )}
      </Section>

      <Section title="原材料库存（关联原材料采购）" description="按名称与规格汇总原材料采购数据">
        {rawMaterials.length ? (
          <>
            <table className="prod-table">
              <thead>
                <tr><th>名称</th><th>规格</th><th>重量(kg)</th><th>单价(元/kg)</th><th>金额</th></tr>
              </thead>
              <tbody>
                {rawMaterials.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.name}</strong></td>
                    <td>{r.spec || "-"}</td>
                    <td>{r.weight}</td>
                    <td>¥{Number(r.unitPrice || 0).toFixed(2)}</td>
                    <td>¥{Number(r.amount || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="finished-grand-total">
              <strong>原材料总计：</strong>
              <span>总重量 {rawSummary.weight} kg · 总金额 ¥{rawSummary.amount.toFixed(2)}</span>
            </div>
          </>
        ) : (
          <EmptyState title="暂无原材料库存数据" description="登记原材料采购后，此处会汇总原材料库存。" />
        )}
      </Section>

      <Section title="盘点物品" description="手动维护盘点物品清单" action={<Button variant="ghost" size="sm" onClick={() => setDialog({ type: "food" })}><Plus size={15} />添加物品</Button>}>
        {data.foods.length ? <table className="prod-table"><thead><tr><th>物品名称</th><th>默认数量</th><th>单位</th><th>参考值</th><th>操作</th></tr></thead><tbody>{data.foods.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.default_portion || "-"}</td><td>{item.portion_unit || "-"}</td><td>{item.calories !== null ? item.calories : "未填"}</td><td><button className="icon-button" title="编辑" onClick={() => setDialog({ type: "food", item })}><Plus size={14} /></button><button className="icon-button danger-text" title="删除" onClick={() => run(() => api.remove("foods", item.id))}><Trash size={16} /></button></td></tr>)}</tbody></table> : <EmptyState title="还没有盘点物品" description="添加经常盘点的物品，之后记录会更快。" action={<Button variant="secondary" onClick={() => setDialog({ type: "food" })}>添加第一个物品</Button>} />}
      </Section>
      <DietDialog dialog={dialog} close={close} foods={data.foods} run={run} onCreated={(collection: string, id: string) => { lastCreated.current = { collection, id }; }} />
    </div>
  );
}

function DietDialog({ dialog, close, foods, run, onCreated }: any) {
  if (!dialog) return null;
  const configs: Record<string, { title: string; collection: any; fields: FieldDefinition[]; defaults: any }> = {
    food: { title: dialog.item?.id ? "编辑盘点物品" : "添加盘点物品", collection: "foods", fields: [{ name: "name", label: "物品名称", required: true }, { name: "default_portion", label: "默认数量", type: "number", step: "0.1" }, { name: "portion_unit", label: "单位", placeholder: "双、包、kg" }, { name: "calories", label: "参考值", type: "number" }], defaults: { default_portion: 1, portion_unit: "双" } },
  };
  const config = configs[dialog.type] ?? configs.food;
  return <Modal open title={config.title} description="没有掌握的数据可以留空。" onClose={close}><EntityForm fields={config.fields} initial={{ ...config.defaults, ...dialog.item }} onCancel={close} onSubmit={async (values) => { if (dialog.item?.id) await run(() => api.update(config.collection, dialog.item.id, values)); else { const created = await run(() => api.create(config.collection, { ...config.defaults, ...values })); onCreated?.(config.collection, created.id); } close(); }} /></Modal>;
}
