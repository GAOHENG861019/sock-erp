import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  MagnifyingGlass, Plus, FloppyDisk, CheckCircle, WarningCircle, SidebarSimple,
  ArrowRight, Command, Power,
} from "@phosphor-icons/react";
import { api } from "../api";
import { useWorkspace } from "../WorkspaceContext";
import { formatDateTime, classNames } from "../utils";
import { normalizeAppearance } from "../appearance";
import { Button, IconButton, Modal, Skeleton, ErrorState, Badge } from "./ui";
import { AmbientEnvironment, chooseAmbientScene } from "./AmbientEnvironment";
import { ModuleArtwork, type ModuleArtworkName } from "./ModuleArtwork";
import type { Entity } from "../types";

const groups = [
  { label: "总览", links: [
    { to: "/", label: "首页总览", module: "dashboard", tone: "sky" },
    { to: "/today", label: "本月总览", module: "today", tone: "cyan" },
  ] },
  { label: "产品管理中心", links: [
    { to: "/fanwa", label: "翻袜", module: "today", tone: "coral" },
    { to: "/fengtou", label: "缝头", module: "media", tone: "teal" },
    { to: "/dingxing", label: "定型", module: "development", tone: "amber" },
  ] },
  { label: "商品与仓库", links: [
    { to: "/development", label: "商品管理", module: "development", tone: "teal" },
    { to: "/consulting", label: "仓库管理", module: "consulting", tone: "amber" },
    { to: "/customer", label: "客户中心", module: "consulting", tone: "coral" },
    { to: "/category", label: "分类中心", module: "fitness", tone: "apricot" },
  ] },
  { label: "支出管理", links: [
    { to: "/fitness", label: "原材料采购", module: "fitness", tone: "sage" },
    { to: "/diet", label: "库存盘点", module: "diet", tone: "apricot" },
    { to: "/entertainment", label: "机器损耗", module: "entertainment", tone: "indigo" },
    { to: "/sales-order", label: "运货运费", module: "diet", tone: "sky" },
    { to: "/salary", label: "工资支出", module: "fitness", tone: "sage" },
    { to: "/expense-stats", label: "支出统计", module: "dashboard", tone: "sky" },
  ] },
  { label: "审核中心", links: [
    { to: "/purchase-audit", label: "采购审核", module: "entertainment", tone: "indigo" },
    { to: "/outbound-audit", label: "出库审核", module: "dashboard", tone: "sky" },
    { to: "/sales-audit", label: "销货审核", module: "media", tone: "coral" },
    { to: "/member", label: "会员管理", module: "settings", tone: "graphite" },
  ] },
  { label: "系统", links: [{ to: "/settings", label: "数据与设置", module: "settings", tone: "graphite" }] },
] satisfies Array<{ label: string; links: Array<{ to: string; label: string; module: ModuleArtworkName; tone: string }> }>;

const collectionRoutes: Record<string, string> = {
  planItems: "/today", mediaContents: "/media", devProjects: "/development", devMilestones: "/development",
  devWorkItems: "/development", devLogs: "/development", clients: "/customer", consultingProjects: "/customer",
  consultingInteractions: "/customer", consultingDeliverables: "/customer", consultingFollowups: "/customer",
  consultingTimeEntries: "/customer", workoutTemplates: "/fitness", workouts: "/fitness", bodyMetrics: "/fitness",
  nutritionTargets: "/diet", foods: "/diet", meals: "/diet", mealItems: "/diet", entertainmentItems: "/entertainment",
  playSessions: "/entertainment", quickMemos: "/",
};

const routeMeta: Record<string, { label: string; module: ModuleArtworkName; tone: string; index: string }> = {
  "/": { label: "首页总览", module: "dashboard", tone: "sky", index: "00" },
  "/today": { label: "本月总览", module: "today", tone: "cyan", index: "01" },
  "/fanwa": { label: "翻袜", module: "today", tone: "coral", index: "02" },
  "/fengtou": { label: "缝头", module: "media", tone: "teal", index: "03" },
  "/dingxing": { label: "定型", module: "development", tone: "amber", index: "04" },
  "/development": { label: "商品管理", module: "development", tone: "teal", index: "05" },
  "/consulting": { label: "仓库管理", module: "consulting", tone: "amber", index: "06" },
  "/customer": { label: "客户中心", module: "consulting", tone: "coral", index: "07" },
  "/category": { label: "分类中心", module: "fitness", tone: "apricot", index: "08" },
  "/fitness": { label: "原材料采购", module: "fitness", tone: "sage", index: "09" },
  "/diet": { label: "库存盘点", module: "diet", tone: "apricot", index: "10" },
  "/entertainment": { label: "机器损耗", module: "entertainment", tone: "indigo", index: "11" },
  "/sales-order": { label: "运货运费", module: "diet", tone: "sky", index: "12" },
  "/salary": { label: "工资支出", module: "fitness", tone: "sage", index: "13" },
  "/expense-stats": { label: "支出统计", module: "dashboard", tone: "sky", index: "14" },
  "/purchase-audit": { label: "采购审核", module: "entertainment", tone: "indigo", index: "15" },
  "/outbound-audit": { label: "出库审核", module: "dashboard", tone: "sky", index: "16" },
  "/sales-audit": { label: "销货审核", module: "media", tone: "coral", index: "17" },
  "/member": { label: "会员管理", module: "settings", tone: "graphite", index: "18" },
  "/settings": { label: "数据与设置", module: "settings", tone: "graphite", index: "19" },
};

export function AppLayout() {
  const { data, saveNow, saveStatus } = useWorkspace();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [exitState, setExitState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const system = useQuery({ queryKey: ["system"], queryFn: api.systemStatus, staleTime: 30_000 });
  const currentPage = routeMeta[location.pathname] ?? routeMeta["/"];
  const appearance = normalizeAppearance(data.settings.appearance);
  const theme = data.settings.theme === "dark" ? "dark" : "light";
  const ambientScene = chooseAmbientScene(currentPage.module, theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.appearance = appearance;
  }, [appearance, theme]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // 环境层视差：滚动时让背景以极低速率位移，玻璃背后才有东西可折射。
  // 只写一个 CSS 变量并由合成层处理，不触发 React 重渲染。
  useEffect(() => {
    const root = document.documentElement;
    if (appearance !== "liquid") {
      root.style.removeProperty("--ambient-shift");
      return;
    }
    // 视差是纯增强。任何一个依赖的浏览器 API 缺席都必须静默降级，
    // 绝不能让整个应用外壳挂掉。
    if (typeof window.requestAnimationFrame !== "function") return;
    const motion = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    let frame = 0;
    const apply = () => {
      frame = 0;
      // 夹在 ±110px：环境层只向外扩了 14%，位移超过这个量长页面底部会露边。
      root.style.setProperty("--ambient-shift", String(Math.max(-110, Math.min(0, Math.round(window.scrollY * -0.04)))));
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(apply); };
    const sync = () => {
      window.removeEventListener("scroll", onScroll);
      if (motion?.matches) { root.style.setProperty("--ambient-shift", "0"); return; }
      window.addEventListener("scroll", onScroll, { passive: true });
      apply();
    };
    sync();
    motion?.addEventListener("change", sync);
    return () => {
      motion?.removeEventListener("change", sync);
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
      root.style.removeProperty("--ambient-shift");
    };
  }, [appearance]);

  const saveAndExit = async () => {
    if (exitState === "saving" || exitState === "done") return;
    setExitState("saving");
    try {
      await saveNow();
      await api.saveAndExit();
      setExitState("done");
      document.title = "袜厂进销存ERP管理系统已安全退出";
    } catch {
      setExitState("error");
    }
  };

  return (
    <div
      className={classNames("app-shell", appearance === "neo" && "neo-shell", collapsed && "sidebar-collapsed")}
      data-appearance={appearance}
      data-module={currentPage.module}
      data-ambient={ambientScene}
    >
      {appearance === "liquid" ? <AmbientEnvironment scene={ambientScene} /> : appearance === "notebook" ? <NotebookEnvironment /> : null}
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <aside className="sidebar glass-regular">
        <div className="brand"><div className="brand-mark" aria-hidden="true"><img src={appearance === "neo" ? "/assets/neo/muzi-app-icon-brand.png" : "/assets/brand/muzi-mark.svg"} alt="" draggable={false} /></div><div className="brand-copy"><strong>袜厂进销存ERP管理系统</strong><span>袜厂本地管理系统</span></div>{appearance === "neo" ? <span className="brand-edition">NEO / SOCK FACTORY ERP</span> : null}</div>
        <Button className="quick-create" onClick={() => setQuickOpen(true)}><Plus size={18} />快速新增</Button>
        <nav aria-label="主导航">
          {groups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-label">{group.label}</span>
              {group.links.map(({ to, label, module, tone }) => (
                <NavLink key={to} to={to} end={to === "/"} data-tone={tone} className={({ isActive }) => classNames("nav-link", isActive && "active")} title={label}>
                  {appearance === "neo" ? <NeoModuleEmblem module={module} /> : <ModuleArtwork module={module} />}<span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className={classNames("local-state", system.data?.backupStatus?.state === "error" && "backup-error")}><span className="status-dot" /><div><strong>{system.data?.backupStatus?.state === "error" ? "自动备份失败" : "仅保存在这台电脑"}</strong><small>{system.data?.backupStatus?.state === "error" ? system.data.backupStatus.lastError : system.data?.latestBackup ? `备份于 ${formatDateTime(system.data.latestBackup.createdAt)}` : "等待首次备份"}</small></div></div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar glass-clear">
          <div className="topbar-left">
            <IconButton label={collapsed ? "展开导航" : "收起导航"} onClick={() => setCollapsed((value) => !value)}><SidebarSimple size={20} /></IconButton>
            <span className="toolbar-page-icon" data-tone={currentPage.tone} aria-hidden="true"><ModuleArtwork module={currentPage.module} /></span>
            <div className="toolbar-context"><strong>{currentPage.label}</strong><span>{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date())}</span></div>
            {appearance === "neo" ? <span className="topbar-index">{currentPage.index} / 19</span> : null}
          </div>
          <div className="topbar-actions">
            <button className="search-trigger glass-clear" aria-label="搜索所有内容" title="搜索所有内容" onClick={() => setSearchOpen(true)}><MagnifyingGlass size={18} /><span>搜索所有内容</span><kbd><Command size={12} />K</kbd></button>
            <Button className="topbar-create" variant="secondary" size="sm" onClick={() => setQuickOpen(true)}><Plus size={16} />快速新建</Button>
            <Button className="manual-save" variant="secondary" size="sm" loading={saveStatus === "saving"} onClick={() => void saveNow().catch(() => undefined)}><FloppyDisk size={16} />手动保存</Button>
            <Button className="save-exit" variant="ghost" size="sm" loading={exitState === "saving"} disabled={exitState === "done"} onClick={() => void saveAndExit()}><Power size={16} />{exitState === "error" ? "退出失败，重试" : "保存并退出"}</Button>
            <SaveIndicator status={saveStatus} />
          </div>
        </header>
        <main className="page-container" id="main-content" tabIndex={-1}><Outlet /></main>
      </div>
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <QuickCreateModal open={quickOpen} onClose={() => setQuickOpen(false)} />
      {exitState === "done" ? <ExitScreen /> : null}
    </div>
  );
}

function NeoModuleEmblem({ module }: { module: ModuleArtworkName }) {
  return <span className="neo-nav-emblem" data-module={module} aria-hidden="true" />;
}

function NotebookEnvironment() {
  return <div className="notebook-environment" aria-hidden="true" />;
}

function ExitScreen() {
  return <div className="exit-screen" role="status"><div className="exit-card"><CheckCircle size={32} weight="fill" /><strong>数据已保存，袜厂进销存ERP管理系统已安全退出</strong><p>现在可以关闭这个页面。下次双击启动图标，会重新启动并打开系统。</p></div></div>;
}

function SaveIndicator({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
  const values = {
    idle: { icon: FloppyDisk, label: "自动保存" },
    saving: { icon: FloppyDisk, label: "保存中" },
    saved: { icon: CheckCircle, label: "已保存" },
    error: { icon: WarningCircle, label: "保存失败" },
  } as const;
  const value = values[status];
  const Icon = value.icon;
  return <div className={`save-indicator save-${status}`} role="status"><Icon size={16} /><span>{value.label}</span></div>;
}

function SearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const search = useQuery({ queryKey: ["search", query], queryFn: () => api.search(query), enabled: open && query.trim().length > 0 });
  const grouped = useMemo(() => {
    return (search.data ?? []).reduce<Record<string, Entity[]>>((result, item) => {
      (result[item.module] ??= []).push(item);
      return result;
    }, {});
  }, [search.data]);
  const moduleNames: Record<string, string> = { dashboard: "首页", today: "本月总览", media: "工作进度", development: "商品管理", consulting: "仓库管理", customer: "客户中心", fitness: "原材料采购", diet: "库存盘点", entertainment: "机器损耗" };
  return (
    <Modal open={open} title="搜索系统" description="按模块查找标题、笔记和记录内容" onClose={onClose} wide>
      <div className="command-search glass-clear"><MagnifyingGlass size={20} /><input autoFocus aria-label="搜索关键词" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入关键词" /></div>
      <div className="search-results">
        {!query ? <div className="search-hint">输入内容开始搜索，按 Esc 关闭。</div> : search.isLoading ? <Skeleton lines={4} /> : search.error ? <ErrorState message={(search.error as Error).message} /> : search.data?.length === 0 ? <div className="search-hint">没有找到匹配内容。</div> : Object.entries(grouped).map(([module, items]) => (
          <section className="search-group" key={module}><h3>{moduleNames[module] ?? module}</h3>{items.map((item) => (
            <button key={`${item.collection}-${item.id}`} onClick={() => { navigate(collectionRoutes[item.collection] ?? "/"); onClose(); }}><span>{item.title || "未命名记录"}</span><ArrowRight size={16} /></button>
          ))}</section>
        ))}
      </div>
    </Modal>
  );
}

function QuickCreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const options = [
    { label: "本月事项", detail: "安排本月要执行的事情", route: "/today?new=1", tone: "cyan", module: "today" },
    { label: "翻袜记录", detail: "记录翻袜生产", route: "/fanwa", tone: "coral", module: "today" },
    { label: "缝头记录", detail: "记录缝头生产", route: "/fengtou", tone: "teal", module: "media" },
    { label: "定型记录", detail: "记录定型生产", route: "/dingxing", tone: "amber", module: "development" },
    { label: "仓库商品", detail: "添加仓库商品", route: "/consulting", tone: "amber", module: "consulting" },
    { label: "客户档案", detail: "添加客户信息", route: "/customer?new=client", tone: "coral", module: "consulting" },
    { label: "原材料", detail: "记录原材料采购", route: "/fitness", tone: "sage", module: "fitness" },
    { label: "机器损耗", detail: "记录机器损耗支出", route: "/entertainment", tone: "indigo", module: "entertainment" },
    { label: "运货运费", detail: "记录运费支出", route: "/sales-order", tone: "sky", module: "diet" },
    { label: "工资支出", detail: "记录工资支出", route: "/salary", tone: "sage", module: "fitness" },
  ];
  return (
    <Modal open={open} title="快速新增" description="选择要记录的内容类型" onClose={onClose}>
      <div className="quick-grid">{options.map((option) => <button data-tone={option.tone} key={option.label} onClick={() => { navigate(option.route); onClose(); }}><span className="quick-option-icon"><ModuleArtwork module={option.module as ModuleArtworkName} /></span><div><Badge>{option.label}</Badge><p>{option.detail}</p></div><ArrowRight size={18} /></button>)}</div>
    </Modal>
  );
}
