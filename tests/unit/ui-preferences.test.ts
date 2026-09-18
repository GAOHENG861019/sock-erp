import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  readUiPreferences,
  saveUiPreferences,
  normalizeTheme,
  emitUiPreferencesChanged,
  isUiPreferencesStorageKey,
  UI_PREFS_STORAGE_KEY,
  UI_PREFS_CHANGED_EVENT,
} from "../../src/ui-preferences";

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("ui-preferences 本地界面偏好", () => {
  it("未设置时读取为空对象，交由归一化给默认值", () => {
    expect(readUiPreferences()).toEqual({});
  });

  it("保存并读回 appearance 与 theme", () => {
    saveUiPreferences({ appearance: "neo", theme: "dark" });
    expect(readUiPreferences()).toEqual({ appearance: "neo", theme: "dark" });
  });

  it("非法 appearance 归一化为 liquid，非法 theme 归一化为 light", () => {
    saveUiPreferences({ appearance: "weird", theme: "blue" });
    const prefs = readUiPreferences();
    expect(prefs.appearance).toBe("liquid");
    expect(prefs.theme).toBe("light");
  });

  it("normalizeTheme 仅在 dark 时返回 dark，其余为 light", () => {
    expect(normalizeTheme("dark")).toBe("dark");
    expect(normalizeTheme("light")).toBe("light");
    expect(normalizeTheme(undefined)).toBe("light");
    expect(normalizeTheme(null)).toBe("light");
  });

  it("忽略 appearance/theme 之外的字段（不影响其他设置）", () => {
    const result = saveUiPreferences({ appearance: "notebook", weekStart: "sunday", dateFormat: "iso" });
    expect(result).toEqual({ appearance: "notebook" });
    const raw = JSON.parse(window.localStorage.getItem("sock-erp-ui-preferences") || "{}");
    expect(raw).toEqual({ appearance: "notebook" });
  });

  it("保存后派发变更事件", () => {
    let heard = 0;
    const handler = () => { heard += 1; };
    window.addEventListener(UI_PREFS_CHANGED_EVENT, handler);
    saveUiPreferences({ appearance: "neo" });
    window.removeEventListener(UI_PREFS_CHANGED_EVENT, handler);
    expect(heard).toBe(1);
  });

  it("emitUiPreferencesChanged 在事件不可用时不抛错", () => {
    const spy = vi.spyOn(EventTarget.prototype, "dispatchEvent").mockImplementation(() => {
      throw new Error("unavailable");
    });
    expect(() => emitUiPreferencesChanged()).not.toThrow();
    spy.mockRestore();
  });

  it("localStorage 中的数据损坏时安全返回空对象", () => {
    window.localStorage.setItem("sock-erp-ui-preferences", "not-json{");
    expect(readUiPreferences()).toEqual({});
  });

  it("多次保存为合并语义（保留之前的偏好）", () => {
    saveUiPreferences({ appearance: "neo" });
    saveUiPreferences({ theme: "dark" });
    expect(readUiPreferences()).toEqual({ appearance: "neo", theme: "dark" });
  });

  it("存储键带有 sock-erp- 前缀（会被云同步覆盖）", () => {
    expect(UI_PREFS_STORAGE_KEY).toBe("sock-erp-ui-preferences");
  });

  it("isUiPreferencesStorageKey 仅识别偏好键", () => {
    expect(isUiPreferencesStorageKey("sock-erp-ui-preferences")).toBe(true);
    expect(isUiPreferencesStorageKey("sock-erp-fanwa")).toBe(false);
    expect(isUiPreferencesStorageKey(null)).toBe(false);
    expect(isUiPreferencesStorageKey(undefined)).toBe(false);
  });
});
