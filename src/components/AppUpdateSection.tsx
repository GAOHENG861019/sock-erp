import { useCallback, useEffect, useState } from "react";
import {
  ArrowClockwise,
  CheckCircle,
  DeviceMobile,
  DownloadSimple,
  Power,
  WarningCircle,
} from "@phosphor-icons/react";
import { Badge, Button, Section } from "./ui";
import {
  checkForUpdates,
  downloadAndInstall,
  getCurrentVersion,
  isNativeApp,
  restartWithBundle,
  type UpdateCheckResult,
} from "../app-update";
import { APP_VERSION } from "../version";

type Phase = "idle" | "checking" | "downloading" | "ready" | "error";

export function AppUpdateSection() {
  const native = isNativeApp();
  const [currentVersion, setCurrentVersion] = useState("");
  const [nativeVersion, setNativeVersion] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [bundleId, setBundleId] = useState("");

  useEffect(() => {
    if (!native) return;
    void getCurrentVersion().then(({ bundleVersion, nativeVersion: nv }) => {
      setCurrentVersion(bundleVersion);
      setNativeVersion(nv);
    });
  }, [native]);

  const handleCheck = useCallback(async () => {
    setPhase("checking");
    setError("");
    try {
      const r = await checkForUpdates();
      setResult(r);
      setPhase("idle");
    } catch (e) {
      setError((e as Error).message || "检查更新失败");
      setPhase("error");
    }
  }, []);

  const handleDownload = useCallback(async () => {
    if (!result?.manifest) return;
    setPhase("downloading");
    setProgress(0);
    setError("");
    try {
      const id = await downloadAndInstall(result.manifest, (percent) =>
        setProgress(Math.round(percent)),
      );
      setBundleId(id);
      setProgress(100);
      setPhase("ready");
    } catch (e) {
      setError((e as Error).message || "下载更新失败");
      setPhase("error");
    }
  }, [result]);

  const handleRestart = useCallback(async () => {
    if (!bundleId) return;
    try {
      await restartWithBundle(bundleId);
    } catch (e) {
      setError((e as Error).message || "重启失败，可手动关闭后重新打开");
      setPhase("error");
    }
  }, [bundleId]);

  const manifest = result?.manifest;

  return (
    <Section
      title="应用更新"
      description="前端更新可在应用内直接完成，无需重新安装 APK"
      action={
        native ? (
          <Button variant="secondary" loading={phase === "checking"} onClick={() => void handleCheck()}>
            <ArrowClockwise size={16} />检查更新
          </Button>
        ) : null
      }
    >
      <div className="app-update-panel">
        <div className="app-update-version">
          <DeviceMobile size={24} />
          {native ? (
            <div>
              <strong>当前版本 {currentVersion || "未知"}</strong>
              <small>原生版本 {nativeVersion || "未知"} · 前端 v{APP_VERSION}</small>
            </div>
          ) : (
            <div>
              <strong>网页 / 电脑端 · 前端 v{APP_VERSION}</strong>
              <small>浏览器和电脑版刷新即为最新，无需应用内更新</small>
            </div>
          )}
        </div>

        {phase === "checking" && <p className="quiet-line">正在检查更新…</p>}

        {phase === "idle" && result && !result.available && (
          <div className="app-update-msg">
            <CheckCircle size={18} />
            <span>{result.message}</span>
          </div>
        )}

        {phase === "idle" && result?.available && manifest && (
          <div className="app-update-card">
            <div className="app-update-card-head">
              <Badge tone="accent">新版本 {manifest.version}</Badge>
              {manifest.releasedAt ? <small>{manifest.releasedAt}</small> : null}
            </div>
            {manifest.notes ? <p className="app-update-notes">{manifest.notes}</p> : null}
            <Button onClick={() => void handleDownload()}>
              <DownloadSimple size={16} />下载并安装
            </Button>
          </div>
        )}

        {phase === "downloading" && (
          <div className="app-update-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <small>正在下载新版本… {progress}%</small>
          </div>
        )}

        {phase === "ready" && (
          <div className="app-update-card">
            <div className="app-update-msg">
              <CheckCircle size={18} />
              <span>新版本已下载完成，将在下次启动时生效。</span>
            </div>
            <Button onClick={() => void handleRestart()}>
              <Power size={16} />立即重启并更新
            </Button>
          </div>
        )}

        {phase === "error" && (
          <div className="app-update-msg app-update-error">
            <WarningCircle size={18} />
            <span>{error || "更新失败，请稍后重试"}</span>
          </div>
        )}
      </div>
    </Section>
  );
}
