import React, { useEffect, useState } from "react";
import type { ObsStatus, PublicSettings } from "../../shared/types";
import { api } from "../api";

export const ObsBadge: React.FC<{ status: ObsStatus | null }> = ({ status }) => {
  if (!status?.enabled) return null;
  return (
    <span className="flex items-center gap-1.5 text-xs text-neutral-400" title={status.error ?? ""}>
      <span className={`w-2 h-2 rounded-full ${status.connected ? "bg-emerald-500" : "bg-red-500"}`} />
      OBS {status.connected ? "connected" : "offline"}
    </span>
  );
};

export const SettingsDialog: React.FC<{ obsStatus: ObsStatus | null; onClose: () => void; onSaved: () => void }> = ({
  obsStatus,
  onClose,
  onSaved,
}) => {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [password, setPassword] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getSettings().then(setSettings, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const { hasPassword: _hasPassword, ...obs } = settings.obs;
      const saved = await api.saveSettings({ obs: { ...obs, ...(password !== undefined ? { password } : {}) } });
      setSettings(saved);
      setPassword(undefined);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const obs = settings?.obs;
  const setObs = (patch: Partial<PublicSettings["obs"]>) => settings && setSettings({ obs: { ...settings.obs, ...patch } });

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-neutral-900 border border-neutral-800 shadow-2xl p-5 space-y-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button className="text-neutral-400 hover:text-white text-xl leading-none" onClick={onClose}>×</button>
        </div>

        {!obs ? (
          <p className="text-sm text-neutral-400">{error ?? "Loading…"}</p>
        ) : (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-300">OBS Studio</h3>
              <ObsBadge status={obsStatus} />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="accent-sky-500 w-4 h-4" checked={obs.enabled} onChange={(e) => setObs({ enabled: e.target.checked })} />
              Connect to OBS
            </label>
            <p className="text-xs text-neutral-500">
              In OBS: Tools → WebSocket Server Settings → Enable WebSocket server. “Show Connect Info” shows the port and password.
            </p>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="label">Host</label>
                <input className="field" value={obs.host} onChange={(e) => setObs({ host: e.target.value })} />
              </div>
              <div className="w-28">
                <label className="label">Port</label>
                <input
                  type="number"
                  className="field"
                  min={1}
                  max={65535}
                  value={obs.port}
                  onChange={(e) => setObs({ port: Math.round(Number(e.target.value) || 0) })}
                />
              </div>
            </div>
            <div>
              <label className="label">Password</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  className="field"
                  autoComplete="off"
                  value={password ?? ""}
                  placeholder={obs.hasPassword ? "•••••••• (saved, type to change)" : "none"}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {obs.hasPassword && password === undefined && (
                  <button className="btn shrink-0" onClick={() => setPassword("")} title="Remove the saved password">Clear</button>
                )}
              </div>
              {password === "" && obs.hasPassword && <p className="mt-1 text-xs text-amber-400">The saved password will be removed.</p>}
            </div>
            {obsStatus?.enabled && obsStatus.error && !obsStatus.connected && (
              <p className="text-xs text-red-400">{obsStatus.error}</p>
            )}
          </section>
        )}

        {error && obs && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={save} disabled={!obs || saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  );
};
