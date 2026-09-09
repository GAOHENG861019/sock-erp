import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppLayout } from "./components/Layout";
import { ErrorState, Skeleton } from "./components/ui";
import { ProductionRecordPage, DingxingPage } from "./pages/ProductionRecordPage";
import { ExpenseRecordPage, ExpenseStatsPage } from "./pages/ExpensePages";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { CategoryPage } from "./pages/CategoryPage";
import { MemberPage } from "./pages/MemberPage";
import { PurchaseAuditPage } from "./pages/PurchaseAuditPage";
import { WarehousePage } from "./pages/WarehousePage";
import { SalaryPage } from "./pages/SalaryPage";

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

const OutboundAuditPage = () => <PlaceholderPage eyebrow="审批流程" title="出库审核" description="出库单据审核与审批记录。" module="dashboard" />;
const SalesAuditPage = () => <PlaceholderPage eyebrow="审批流程" title="销货审核" description="销货单据审核与审批记录。" module="media" />;

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
      { path: "consulting", element: <WarehousePage /> },
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
