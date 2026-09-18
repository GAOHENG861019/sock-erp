import { normalizeAppearance, type Appearance } from "./appearance";

// 界面风格 / 主题属于纯前端视觉偏好。
// 电脑端会保存到后端（多设备同步），手机 APP（Capacitor 打包后无后端，
// /api/settings 会回退返回 index.html）则依赖这里的 localStorage 持久化。
// 后端有值时以后端为准，本地仅作为无后端场景的兜底。

export type Theme = "light" | "dark";

/** 界面偏好在 localStorage 中的存储键（也被云同步按 sock-erp- 前缀同步）。 */
export const UI_PREFS_STORAGE_KEY = "sock-erp-ui-preferences";

/** 本地界面偏好变更事件（同一文档内 localStorage 写入不会触发 storage 事件，需手动派发）。 */
export const UI_PREFS_CHANGED_EVENT = "sock-erp-ui-prefs-changed";

/** 判断某个 localStorage 键是否为界面偏好键（用于云同步写入后通知界面刷新）。 */
export function isUiPreferencesStorageKey(key: string | null | undefined): boolean {
  return key === UI_PREFS_STORAGE_KEY;
}

export function emitUiPreferencesChanged(): void {
  try {
    window.dispatchEvent(new Event(UI_PREFS_CHANGED_EVENT));
  } catch {
    // 某些环境下事件不可用，忽略（保存本身已生效）
  }
}

export function normalizeTheme(value: unknown): Theme {
  return value === "dark" ? "dark" : "light";
}

export type UiPreferences = {
  appearance?: Appearance;
  theme?: Theme;
};

function isUiPrefKey(key: string): key is keyof UiPreferences {
  return key === "appearance" || key === "theme";
}

/** 读取本地保存的界面偏好；非法或缺失时返回空对象（交由归一化给默认值）。 */
export function readUiPreferences(): UiPreferences {
  try {
    const raw = localStorage.getItem(UI_PREFS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const prefs: UiPreferences = {};
    if (parsed.appearance !== undefined) {
      prefs.appearance = normalizeAppearance(parsed.appearance);
    }
    if (parsed.theme !== undefined) {
      prefs.theme = normalizeTheme(parsed.theme);
    }
    return prefs;
  } catch {
    return {};
  }
}

/**
 * 合并保存界面偏好（仅处理 appearance / theme，忽略其他字段）。
 * 返回保存后的完整本地偏好。localStorage 不可用时静默降级。
 */
export function saveUiPreferences(patch: Record<string, unknown>): UiPreferences {
  const next: UiPreferences = { ...readUiPreferences() };
  for (const key of Object.keys(patch)) {
    if (!isUiPrefKey(key)) continue;
    if (key === "appearance") {
      next.appearance = normalizeAppearance(patch[key]);
    } else if (key === "theme") {
      next.theme = normalizeTheme(patch[key]);
    }
  }
  try {
    localStorage.setItem(UI_PREFS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 隐私模式 / 存储被禁用时忽略，界面仍可在当前会话内切换
  }
  emitUiPreferencesChanged();
  return next;
}
