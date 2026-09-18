import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { WorkspaceState } from "./types";
import { readUiPreferences, isUiPreferencesStorageKey, UI_PREFS_CHANGED_EVENT } from "./ui-preferences";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type SaveHandler = () => Promise<void> | void;

type WorkspaceContextValue = {
  data: WorkspaceState;
  loading: boolean;
  error: string | null;
  saveStatus: SaveStatus;
  run: <T>(operation: () => Promise<T>) => Promise<T>;
  saveNow: () => Promise<void>;
  registerSaveHandler: (handler: SaveHandler) => () => void;
  refresh: () => Promise<void>;
};

const emptyState: WorkspaceState = {
  planItems: [], quickMemos: [], mediaContents: [], devProjects: [], devMilestones: [], devWorkItems: [], devLogs: [],
  clients: [], consultingProjects: [], consultingInteractions: [], consultingDeliverables: [], consultingFollowups: [], consultingTimeEntries: [],
  workoutTemplates: [], workoutTemplateExercises: [], workouts: [], workoutExercises: [], workoutSets: [], bodyMetrics: [], nutritionTargets: [],
  foods: [], meals: [], mealItems: [], entertainmentItems: [], playSessions: [], settings: {}, trash: [],
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveHandlers = useRef(new Set<SaveHandler>());
  const query = useQuery({ queryKey: ["workspace"], queryFn: api.state, staleTime: 15_000 });

  // 界面风格/主题在无后端环境（手机 APP）下从 localStorage 兜底；后端有值时后端优先。
  // 本地偏好保存后会派发事件，驱动这里重新计算（手机端 query.data 恒为 undefined）。
  // 同时监听云同步：其他设备/初始化拉取写入偏好键后也要刷新（多设备实时同步）。
  const [prefsTick, setPrefsTick] = useState(0);
  useEffect(() => {
    const bump = () => setPrefsTick((t) => t + 1);
    const onCloudSync = (event: Event) => {
      const key = (event as CustomEvent<{ key?: string }>).detail?.key;
      if (isUiPreferencesStorageKey(key)) bump();
    };
    window.addEventListener(UI_PREFS_CHANGED_EVENT, bump);
    window.addEventListener("cloud-storage-sync", onCloudSync);
    window.addEventListener("cloud-storage-local", onCloudSync);
    return () => {
      window.removeEventListener(UI_PREFS_CHANGED_EVENT, bump);
      window.removeEventListener("cloud-storage-sync", onCloudSync);
      window.removeEventListener("cloud-storage-local", onCloudSync);
    };
  }, []);
  const data: WorkspaceState = useMemo(() => {
    const base = query.data ?? emptyState;
    return { ...base, settings: { ...readUiPreferences(), ...base.settings } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, prefsTick]);

  useEffect(() => {
    if (saveStatus !== "saved") return;
    const timer = window.setTimeout(() => setSaveStatus("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [saveStatus]);

  const refreshSavedData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workspace"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["system"] }),
      queryClient.invalidateQueries({ queryKey: ["backups"] }),
    ]);
  }, [queryClient]);

  const run = useCallback(async <T,>(operation: () => Promise<T>) => {
    setSaveStatus("saving");
    try {
      const result = await operation();
      await refreshSavedData();
      setSaveStatus("saved");
      return result;
    } catch (error) {
      setSaveStatus("error");
      throw error;
    }
  }, [refreshSavedData]);

  const registerSaveHandler = useCallback((handler: SaveHandler) => {
    saveHandlers.current.add(handler);
    return () => saveHandlers.current.delete(handler);
  }, []);

  const saveNow = useCallback(async () => {
    setSaveStatus("saving");
    try {
      for (const handler of [...saveHandlers.current]) await handler();
      await api.saveNow();
      await refreshSavedData();
      setSaveStatus("saved");
    } catch (error) {
      setSaveStatus("error");
      throw error;
    }
  }, [refreshSavedData]);

  const value = useMemo<WorkspaceContextValue>(() => ({
    data,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    saveStatus,
    run,
    saveNow,
    registerSaveHandler,
    refresh: async () => {
      await queryClient.invalidateQueries();
    },
  }), [data, query.isLoading, query.error, queryClient, registerSaveHandler, run, saveNow, saveStatus]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("WorkspaceProvider is missing");
  return value;
}
