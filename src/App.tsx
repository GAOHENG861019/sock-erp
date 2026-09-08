import { lazy, Suspense, type ReactNode, useEffect, useMemo, useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppLayout } from "./components/Layout";
import { ErrorState, Skeleton, PageHeader, Section, Button, EmptyState } from "./components/ui";
import { ProductionRecordPage, DingxingPage } from "./pages/ProductionRecordPage";
import { ExpenseRecordPage, ExpenseStatsPage } from "./pages/ExpensePages";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { CategoryPage } from "./pages/CategoryPage";
import { MemberPage } from "./pages/MemberPage";
import { Plus, Trash, Calculator } from "@phosphor-icons/react";
import { ModuleArtwork } from "./components/ModuleArtwork";

const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const TodayPage = lazy(() => import("./pages/TodayPage").then((module) => ({ default: module.TodayPage })));
const MediaPage = lazy(() => import("./pages/MediaPage").then((module) => ({ default: module.MediaPage })));
const DevelopmentPage = lazy(() => import("./pages/DevelopmentPage").then((module) => ({ default: module.DevelopmentPage })));
const ConsultingPage = lazy(() => import("./pages/ConsultingPage").then((module) => ({ default: module.ConsultingPage })));
const FitnessPage = lazy(() => import("./pages/FitnessPage").then((module) => ({ default: module.FitnessPage })));
const DietPage = lazy(() => import("./pages/DietPage").then((module) => ({ default: module.DietPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));

const FanwaPage = () => <ProductionRecordPage eyebrow="生产工序" title="翻袜" description="翻袜工序记录：姓名、规格、数量、单价，自动合计。" module="today" storageKey="sock-erp-fanwa" />;
const FengtouPage = () => <ProductionRecordPage eyebrow="生产工序" title="缝头" description="缝头工序记录：姓名、规格、数量、单价，自动合计。" module="media" storageKey="sock-erp-fengtou" />;
const MachineLossPage = () => <ExpenseRecordPage eyebrow="设备维护" title="机器损耗" description="记录机器维修、配件更换等损耗支出。" module="entertainment" storageKey="sock-erp-machine-loss" />;
const FreightPage = () => <ExpenseRecordPage eyebrow="物流费用" title="运货运费" description="记录货物运输、快递等运费支出。" module="diet" storageKey="sock-erp-freight" />;
const SalaryPage = () => <ExpenseRecordPage eyebrow="人工成本" title="工资支出" description="记录员工工资、奖金等人工支出。" module="fitness" storageKey="sock-erp-salary" />;

const PurchaseAuditPage = () => <PlaceholderPage eyebrow="审批流程" title="采购审核" description="采购单据审核与审批记录。" module="entertainment" />;
const OutboundAuditPage = () => <PlaceholderPage eyebrow="审批流程" title="出库审核" description="出库单据审核与审批记录。" module="dashboard" />;
const SalesAuditPage = () => <PlaceholderPage eyebrow="审批流程" title="销货审核" description="销货单据审核与审批记录。" module="media" />;

/** 仓库管理：添加商品（简单商品录入） */
function WarehouseProductPage() {
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

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Skeleton lines={8} />}>{children}</Suspense>;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    errorElement: <div className="route-error"><ErrorState message="页面无法打开，请返回首页后重试。" /></div>,
    children: [
      { index: true, element: <LazyPage><DashboardPage /></LazyPage> },
      { path: "today", element: <LazyPage><TodayPage /></LazyPage> },
      { path: "fanwa", element: <FanwaPage /> },
      { path: "fengtou", element: <FengtouPage /> },
      { path: "dingxing", element: <DingxingPage module="development" /> },
      { path: "media", element: <LazyPage><MediaPage /></LazyPage> },
      { path: "development", element: <LazyPage><DevelopmentPage /></LazyPage> },
      { path: "consulting", element: <WarehouseProductPage /> },
      { path: "customer", element: <LazyPage><ConsultingPage /></LazyPage> },
      { path: "category", element: <CategoryPage /> },
      { path: "fitness", element: <LazyPage><FitnessPage /></LazyPage> },
      { path: "diet", element: <LazyPage><DietPage /></LazyPage> },
      { path: "entertainment", element: <MachineLossPage /> },
      { path: "sales-order", element: <FreightPage /> },
      { path: "salary", element: <SalaryPage /> },
      { path: "expense-stats", element: <ExpenseStatsPage /> },
      { path: "purchase-audit", element: <PurchaseAuditPage /> },
      { path: "outbound-audit", element: <OutboundAuditPage /> },
      { path: "sales-audit", element: <SalesAuditPage /> },
      { path: "member", element: <MemberPage /> },
      { path: "settings", element: <LazyPage><SettingsPage /></LazyPage> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
