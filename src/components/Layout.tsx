import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  MagnifyingGlass, Plus, FloppyDisk, CheckCircle, WarningCircle, SidebarSimple,
  ArrowRight, Command, Power, Cloud, List, Download,
} from "@phosphor-icons/react";
import { api } from "../api";
import { useWorkspace } from "../WorkspaceContext";
import { useSyncStatus } from "../sync";
import { formatDateTime, classNames } from "../utils";
import { normalizeAppearance } from "../appearance";
import { Button, IconButton, Modal, Skeleton, ErrorState, Badge } from "./ui";
import { AmbientEnvironment, chooseAmbientScene } from "./AmbientEnvironment";
import { ModuleArtwork, type ModuleArtworkName } from "./ModuleArtwork";
import type { Entity } from "../types";
import { AppUpdate, isNativeApp } from "../plugins/AppUpdate";
import { shouldPromptUpdate } from "../app-update";
import { APP_VERSION } from "../version";
import { setupNativeBackButton } from "../native-back";
import { PullToRefresh } from "./PullToRefresh";

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
    { to: "/category", label: "分类中心", module: "fitness", tone: "apricot" },
    { to: "/diet", label: "库存盘点", module: "diet", tone: "apricot" },
  ] },
  { label: "客户中心", links: [
    { to: "/customer", label: "客户中心", module: "consulting", tone: "coral" },
  ] },
  { label: "收支管理", links: [
    { to: "/fitness", label: "原材料采购", module: "fitness", tone: "sage" },
    { to: "/entertainment", label: "机器损耗", module: "entertainment", tone: "indigo" },
    { to: "/sales-order", label: "运货运费", module: "diet", tone: "sky" },
    { to: "/salary", label: "工资支出", module: "fitness", tone: "sage" },
    { to: "/payment-income", label: "货款收入", module: "dashboard", tone: "sage" },
    { to: "/expense-stats", label: "支收统计", module: "dashboard", tone: "sky" },
  ] },
  { label: "审核中心", links: [
    { to: "/purchase-audit", label: "采购审核", module: "entertainment", tone: "indigo" },
    { to: "/outbound-audit", label: "出库审核", module: "dashboard", tone: "sky" },
    { to: "/sales-audit", label: "销货审核", module: "media", tone: "coral" },
  ] },
  { label: "系统", links: [{ to: "/settings", label: "数据与设置", module: "settings", tone: "graphite" }] },
] satisfies Array<{ label: string; links: Array<{ to: string; label: string; module: ModuleArtworkName; tone: string }> }>;

const ALL_MENU_ROUTES = groups.flatMap((g) => g.links.map((l) => l.to));

/**
 * 解析侧边栏可见菜单。
 * 仅接受「全部为已知合法路由」的数组；遇到字符串（历史云同步污染）、
 * 非法值或过滤后为空时，回退为展示全部功能，避免菜单只剩首页。
 */
function resolveVisibleMenuItems(): string[] {
  try {
    const raw = localStorage.getItem("sock-erp-visible-menu");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(
          (x): x is string => typeof x === "string" && ALL_MENU_ROUTES.includes(x),
        );
        // 完整菜单返回常量引用，避免每次解析产生新数组引用触发重渲染
        if (valid.length === ALL_MENU_ROUTES.length) return ALL_MENU_ROUTES;
        if (valid.length > 0) return valid;
      }
    }
  } catch {
    /* 损坏数据：回退全部 */
  }
  return ALL_MENU_ROUTES;
}

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
  "/category": { label: "分类中心", module: "fitness", tone: "apricot", index: "07" },
  "/diet": { label: "库存盘点", module: "diet", tone: "apricot", index: "08" },
  "/customer": { label: "客户中心", module: "consulting", tone: "coral", index: "09" },
  "/fitness": { label: "原材料采购", module: "fitness", tone: "sage", index: "10" },
  "/entertainment": { label: "机器损耗", module: "entertainment", tone: "indigo", index: "11" },
  "/sales-order": { label: "运货运费", module: "diet", tone: "sky", index: "12" },
  "/salary": { label: "工资支出", module: "fitness", tone: "sage", index: "13" },
  "/payment-income": { label: "货款收入", module: "dashboard", tone: "sage", index: "14" },
  "/expense-stats": { label: "支收统计", module: "dashboard", tone: "sky", index: "15" },
  "/purchase-audit": { label: "采购审核", module: "entertainment", tone: "indigo", index: "16" },
  "/outbound-audit": { label: "出库审核", module: "dashboard", tone: "sky", index: "17" },
  "/sales-audit": { label: "销货审核", module: "media", tone: "coral", index: "18" },
  "/settings": { label: "数据与设置", module: "settings", tone: "graphite", index: "19" },
};

export function AppLayout() {
  const { data, saveNow, saveStatus } = useWorkspace();
  const syncStatus = useSyncStatus();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [exitState, setExitState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [updateInfo, setUpdateInfo] = useState<{ version: string; apkUrl: string; downloadUrl: string; changes: string[] } | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [visibleMenuItems, setVisibleMenuItems] = useState<string[]>(resolveVisibleMenuItems);

  // 云同步（冷启动拉取/多设备变更）更新菜单配置后，侧边栏随之刷新。
  // 只监听云端事件：本地写入会派发 cloud-storage-local，监听它会与下方持久化
  // effect 形成「写入→事件→setState→再写入」的无限循环，故不监听。
  useEffect(() => {
    const reload = (e: Event) => {
      const key = (e as CustomEvent)?.detail?.key;
      if (key && key !== "sock-erp-visible-menu") return;
      setVisibleMenuItems((prev) => {
        const next = resolveVisibleMenuItems();
        // 内容一致则保持原引用，避免无谓重渲染/再次持久化
        if (prev.length === next.length && prev.every((x, i) => x === next[i])) return prev;
        return next;
      });
    };
    window.addEventListener("cloud-storage-sync", reload);
    return () => window.removeEventListener("cloud-storage-sync", reload);
  }, []);

  useEffect(() => {
    try { localStorage.setItem("sock-erp-visible-menu", JSON.stringify(visibleMenuItems)); } catch { /* ignore */ }
  }, [visibleMenuItems]);

  const toggleMenuItem = (to: string) => {
    setVisibleMenuItems((prev) => prev.includes(to) ? prev.filter((t) => t !== to) : [...prev, to]);
  };

  const filteredGroups = groups.map((group) => ({
    ...group,
    links: group.links.filter((l) => visibleMenuItems.includes(l.to)),
  })).filter((g) => g.links.length > 0);
  const system = useQuery({ queryKey: ["system"], queryFn: async () => { try { return (await api.systemStatus()) ?? null; } catch { return null; } }, staleTime: 30_000 });
  const currentPage = routeMeta[location.pathname] ?? routeMeta["/"];
  const appearance = normalizeAppearance(data.settings.appearance);
  const theme = data.settings.theme === "dark" ? "dark" : "light";
  const ambientScene = chooseAmbientScene(currentPage.module, theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.appearance = appearance;
  }, [appearance, theme]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // 安卓返回键：先关弹层/抽屉，再返回上一页，首页双击退出。仅原生 APP 生效。
  const locationRef = useRef(location);
  locationRef.current = location;
  useEffect(() => setupNativeBackButton(() => locationRef.current, navigate), [navigate]);

  // 启动时自动检测更新
  useEffect(() => {
    const dismissed = localStorage.getItem("sock-erp-update-dismissed");
    (async () => {
      let info = null;
      // 优先从Supabase获取
      try {
        const res = await fetch("https://naocybheyicuilbvjpbw.supabase.co/rest/v1/app_data?storage_key=eq.latest_app_version&select=data", {
          headers: { "apikey": "sb_publishable_Os7rBHTmi4zJiUudIwFSeA_uG-uN-YE", "Authorization": "Bearer sb_publishable_Os7rBHTmi4zJiUudIwFSeA_uG-uN-YE" },
          signal: AbortSignal.timeout(8000)
        });
        if (res.ok) {
          const rows = await res.json();
          if (rows && rows.length > 0 && rows[0].data) info = rows[0].data;
        }
      } catch { /* fallback */ }
      // CDN fallback
      if (!info) {
        const urls = [
          "https://cdn.jsdelivr.net/gh/GAOHENG861019/sock-erp@master/public/version.json",
          "https://raw.githubusercontent.com/GAOHENG861019/sock-erp/master/public/version.json",
        ];
        for (const url of urls) {
          try {
            const res = await fetch(url + "?t=" + Date.now(), { signal: AbortSignal.timeout(8000) });
            if (res.ok) { info = await res.json(); break; }
          } catch { /* try next */ }
        }
      }
      if (shouldPromptUpdate({ currentVersion: APP_VERSION, latestVersion: info?.version, dismissedVersion: dismissed })) setUpdateInfo(info);
    })();
  }, []);

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
      className={classNames("app-shell", appearance === "neo" && "neo-shell", collapsed && "sidebar-collapsed", mobileMenuOpen && "mobile-menu-open")}
      data-appearance={appearance}
      data-module={currentPage.module}
      data-ambient={ambientScene}
    >
      {appearance === "liquid" ? <AmbientEnvironment scene={ambientScene} /> : appearance === "notebook" ? <NotebookEnvironment /> : null}
      <PullToRefresh />
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      {mobileMenuOpen ? <div className="mobile-overlay" onClick={() => setMobileMenuOpen(false)} /> : null}
      <aside className="sidebar glass-regular">
        <div className="brand"><div className="brand-mark" aria-hidden="true"><img src={appearance === "neo" ? "/assets/neo/muzi-app-icon-brand.png" : "/assets/brand/muzi-mark.svg"} alt="" draggable={false} /></div><div className="brand-copy"><strong>袜厂进销存ERP管理系统</strong><span>袜厂本地管理系统</span></div>{appearance === "neo" ? <span className="brand-edition">NEO / SOCK FACTORY ERP</span> : null}</div>
        <Button className="quick-create" onClick={() => setQuickOpen(true)}><Plus size={18} />快速新增</Button>
        <nav aria-label="主导航">
          {filteredGroups.map((group) => (
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
            <IconButton label="菜单" className="mobile-menu-btn" onClick={() => setMobileMenuOpen(true)}><List size={20} /></IconButton>
            <IconButton label={collapsed ? "展开导航" : "收起导航"} className="desktop-collapse-btn" onClick={() => setCollapsed((value) => !value)}><SidebarSimple size={20} /></IconButton>
            <span className="toolbar-page-icon" data-tone={currentPage.tone} aria-hidden="true"><ModuleArtwork module={currentPage.module} /></span>
            <div className="toolbar-context"><strong>{currentPage.label}</strong><span>{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date())}</span></div>
            {appearance === "neo" ? <span className="topbar-index">{currentPage.index} / 20</span> : null}
          </div>
          <div className="topbar-actions">
            <button className="search-trigger glass-clear" aria-label="搜索所有内容" title="搜索所有内容" onClick={() => setSearchOpen(true)}><MagnifyingGlass size={18} /><span>搜索所有内容</span><kbd><Command size={12} />K</kbd></button>
            <Button className="topbar-create" variant="secondary" size="sm" onClick={() => setQuickOpen(true)}><Plus size={16} />快速新建</Button>
            <Button className="manual-save" variant="secondary" size="sm" loading={saveStatus === "saving"} onClick={() => void saveNow().catch(() => undefined)}><FloppyDisk size={16} />手动保存</Button>
            <Button className="save-exit" variant="ghost" size="sm" loading={exitState === "saving"} disabled={exitState === "done"} onClick={() => void saveAndExit()}><Power size={16} />{exitState === "error" ? "退出失败，重试" : "保存并退出"}</Button>
            <span
              className="cloud-sync-indicator"
              title={syncStatus === "syncing" ? "正在同步到云端" : syncStatus === "error" ? "云同步失败" : syncStatus === "offline" ? "离线模式" : "云端已同步"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                color: syncStatus === "syncing" ? "#3498db" : syncStatus === "error" ? "#e74c3c" : syncStatus === "offline" ? "#95a5a6" : "#27ae60",
              }}
            >
              <Cloud size={16} weight={syncStatus === "syncing" ? "regular" : "fill"} />
              {syncStatus === "syncing" ? "同步中" : syncStatus === "error" ? "同步失败" : syncStatus === "offline" ? "离线" : "已同步"}
            </span>
            <SaveIndicator status={saveStatus} />
          </div>
        </header>
        <main className="page-container" id="main-content" tabIndex={-1}><Outlet /></main>
        <nav className="bottom-nav" aria-label="底部导航">
          <NavLink to="/" end className={({ isActive }) => `bottom-nav-item ${isActive ? "active" : ""}`}>
            <ModuleArtwork module="dashboard" /><span>首页</span>
          </NavLink>
          <NavLink to="/fanwa" className={({ isActive }) => `bottom-nav-item ${isActive ? "active" : ""}`}>
            <ModuleArtwork module="today" /><span>翻袜</span>
          </NavLink>
          <NavLink to="/fengtou" className={({ isActive }) => `bottom-nav-item ${isActive ? "active" : ""}`}>
            <ModuleArtwork module="media" /><span>缝头</span>
          </NavLink>
          <NavLink to="/dingxing" className={({ isActive }) => `bottom-nav-item ${isActive ? "active" : ""}`}>
            <ModuleArtwork module="development" /><span>定型</span>
          </NavLink>
          <button className="bottom-nav-item" onClick={() => setMobileMenuOpen(true)}>
            <List size={22} /><span>更多</span>
          </button>
        </nav>
      </div>
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <QuickCreateModal open={quickOpen} onClose={() => setQuickOpen(false)} visibleMenuItems={visibleMenuItems} toggleMenuItem={toggleMenuItem} />
      <Modal open={Boolean(updateInfo) && !updateDismissed} title="发现新版本" description={`袜厂进销存ERP v${updateInfo?.version} 已发布`} onClose={() => { setUpdateDismissed(true); localStorage.setItem("sock-erp-update-dismissed", updateInfo?.version || ""); }}>
        <div style={{ padding: "8px 0" }}>
          {updateInfo?.changes?.length ? (
            <div style={{ marginBottom: 16 }}>
              <strong style={{ fontSize: 14 }}>更新内容：</strong>
              <ul style={{ margin: "8px 0 0 18px", padding: 0, fontSize: 13, color: "#555", lineHeight: 1.8 }}>
                {updateInfo.changes.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <Button onClick={async () => {
              const apkUrl = updateInfo?.apkUrl || updateInfo?.downloadUrl;
              if (!apkUrl) return;
              if (isNativeApp() && updateInfo?.apkUrl) {
                try {
                  await AppUpdate.downloadAndInstall({ url: updateInfo.apkUrl });
                } catch {
                  window.open(apkUrl, "_system");
                }
              } else {
                window.open(apkUrl, "_system");
              }
            }}><Download size={16} />立即更新</Button>
            <Button variant="secondary" onClick={() => { setUpdateDismissed(true); localStorage.setItem("sock-erp-update-dismissed", updateInfo?.version || ""); }}>稍后再说</Button>
          </div>
          <p style={{ fontSize: 12, color: "#999", marginTop: 12 }}>覆盖安装不会丢失任何数据</p>
        </div>
      </Modal>
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

function QuickCreateModal({ open, onClose, visibleMenuItems, toggleMenuItem }: { open: boolean; onClose: () => void; visibleMenuItems: string[]; toggleMenuItem: (to: string) => void }) {
  const navigate = useNavigate();
  const allOptions = [
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
    { label: "货款收入", detail: "记录货款收入", route: "/payment-income", tone: "sage", module: "dashboard" },
    { label: "库存盘点", detail: "盘点库存", route: "/diet", tone: "apricot", module: "diet" },
  ];
  const [customize, setCustomize] = useState(false);
  const [customizeTab, setCustomizeTab] = useState<"quick" | "menu">("quick");
  const [selected, setSelected] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("sock-erp-quick-create");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* ignore */ }
    return allOptions.map((o) => o.label);
  });

  useEffect(() => {
    try { localStorage.setItem("sock-erp-quick-create", JSON.stringify(selected)); } catch { /* ignore */ }
  }, [selected]);

  const visibleOptions = allOptions.filter((o) => selected.includes(o.label));

  const toggleOption = (label: string) => {
    setSelected((prev) => prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]);
  };

  const allMenuItems = groups.flatMap((g) => g.links.map((l) => ({ ...l, group: g.label })));

  return (
    <Modal open={open} title="快速新增" description={customize ? (customizeTab === "quick" ? "勾选要显示的快捷入口" : "勾选要显示的菜单项") : "选择要记录的内容类型"} onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        {customize ? (
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant={customizeTab === "quick" ? "primary" : "ghost"} size="sm" onClick={() => setCustomizeTab("quick")}>快捷入口</Button>
            <Button variant={customizeTab === "menu" ? "primary" : "ghost"} size="sm" onClick={() => setCustomizeTab("menu")}>菜单管理</Button>
          </div>
        ) : <div />}
        <Button variant="ghost" size="sm" onClick={() => setCustomize(!customize)}>{customize ? "完成" : "自定义"}</Button>
      </div>
      {customize && customizeTab === "menu" ? (
        <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {groups.map((group) => (
            <div key={group.label} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "#999", marginBottom: 6, fontWeight: 600 }}>{group.label}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {group.links.map((link) => (
                  <label key={link.to} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, cursor: "pointer", background: visibleMenuItems.includes(link.to) ? "rgba(59,130,246,0.08)" : "transparent", fontSize: 13 }}>
                    <input type="checkbox" checked={visibleMenuItems.includes(link.to)} onChange={() => toggleMenuItem(link.to)} />
                    <span>{link.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : customize && customizeTab === "quick" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {allOptions.map((option) => (
            <label key={option.label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, cursor: "pointer", background: selected.includes(option.label) ? "rgba(59,130,246,0.08)" : "transparent" }}>
              <input type="checkbox" checked={selected.includes(option.label)} onChange={() => toggleOption(option.label)} />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      ) : (
        <div className="quick-grid">{visibleOptions.map((option) => <button data-tone={option.tone} key={option.label} onClick={() => { navigate(option.route); onClose(); }}><span className="quick-option-icon"><ModuleArtwork module={option.module as ModuleArtworkName} /></span><div><Badge>{option.label}</Badge><p>{option.detail}</p></div><ArrowRight size={18} /></button>)}</div>
      )}
    </Modal>
  );
}
