import React, { useRef, useState } from "react";
import { LIMITS, hasLiveState, type Appearance, type ButtonConfig, type OnState } from "../../shared/types";
import { api } from "../api";
import { fileToIcon } from "../image";
import type { EditorContext } from "../model";
import { ActionEditor } from "./ActionEditor";

const EMOJI = ["⭐", "▶", "⏯", "⏭", "🔊", "🔇", "🎤", "🎥", "🔴", "💬", "📁", "🌐", "🔒", "💡", "⚙", "🎮", "📷", "✂", "📋", "🧮"];

/**
 * Edits label / icon / image / colors. With `inherit`, empty fields mean
 * "same as the normal state" (used for the on-state).
 */
const AppearanceEditor: React.FC<{
  value: Appearance;
  onChange: (patch: Partial<Appearance>) => void;
  inherit?: Appearance;
}> = ({ value, onChange, inherit }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [imgError, setImgError] = useState<string | null>(null);

  const colorField = (key: "color" | "textColor", label: string, fallback: string) => {
    const v = value[key];
    return (
      <div>
        <label className="label">{label}</label>
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            className={`h-9 w-14 rounded bg-transparent cursor-pointer ${inherit && !v ? "opacity-40" : ""}`}
            value={v ?? inherit?.[key] ?? fallback}
            onChange={(e) => onChange({ [key]: e.target.value })}
          />
          {inherit && v && (
            <button className="text-xs text-neutral-400 hover:text-white" onClick={() => onChange({ [key]: undefined })} title="Use the normal color">
              reset
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Label</label>
        <input
          className="field"
          maxLength={LIMITS.maxLabel}
          value={value.label ?? ""}
          placeholder={inherit ? inherit.label || "(same as normal)" : ""}
          onChange={(e) => onChange({ label: inherit && !e.target.value ? undefined : e.target.value })}
        />
      </div>

      <div>
        <label className="label">Icon</label>
        {value.image ? (
          <div className="flex items-center gap-3">
            <img src={value.image} alt="" className="w-14 h-14 object-contain rounded bg-neutral-800" />
            <button className="btn" onClick={() => fileRef.current?.click()}>Replace</button>
            <button className="btn" onClick={() => onChange({ image: undefined })}>{inherit ? "Remove" : "Use emoji instead"}</button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                className="field text-2xl w-20 text-center"
                maxLength={LIMITS.maxIcon}
                value={value.icon ?? ""}
                placeholder={inherit ? inherit.image ? "img" : inherit.icon ?? "" : ""}
                onChange={(e) => onChange({ icon: inherit && !e.target.value ? undefined : e.target.value })}
              />
              <button className="btn" onClick={() => fileRef.current?.click()}>Upload image…</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {EMOJI.map((em) => (
                <button key={em} className="w-8 h-8 rounded hover:bg-neutral-800 text-lg" onClick={() => onChange({ icon: em })}>
                  {em}
                </button>
              ))}
            </div>
            {!inherit && <p className="mt-1 text-xs text-neutral-500">Tip: Win + . opens the Windows emoji picker.</p>}
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              setImgError(null);
              onChange({ image: await fileToIcon(file) });
            } catch (err) {
              setImgError(err instanceof Error ? err.message : String(err));
            }
          }}
        />
        {imgError && <p className="mt-1 text-xs text-red-400">{imgError}</p>}
      </div>

      <div className="flex gap-4">
        {colorField("color", "Background", "#262626")}
        {colorField("textColor", "Text", "#ffffff")}
      </div>
    </div>
  );
};

export const Inspector: React.FC<{
  button: ButtonConfig;
  ctx: EditorContext;
  /** Where this button lives, so "Move to…" can skip it. */
  location: string;
  moveTargets: { key: string; label: string }[];
  onChange: (b: ButtonConfig) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (targetKey: string) => void;
}> = ({ button, ctx, location, moveTargets, onChange, onDelete, onDuplicate, onMove }) => {
  const [test, setTest] = useState<{ state: "idle" | "running" | "ok" | "error"; msg?: string }>({ state: "idle" });
  const set = (patch: Partial<ButtonConfig>) => onChange({ ...button, ...patch });
  const setOn = (patch: Partial<OnState>) => set({ onState: { ...button.onState, ...patch } });
  const live = hasLiveState(button.action);

  const runTest = async () => {
    setTest({ state: "running" });
    try {
      await api.testAction(button.action);
      setTest({ state: "ok" });
    } catch (e) {
      setTest({ state: "error", msg: e instanceof Error ? e.message : String(e) });
    }
    setTimeout(() => setTest((t) => (t.state === "ok" ? { state: "idle" } : t)), 1500);
  };

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-300">Appearance</h3>
        <AppearanceEditor value={button} onChange={set} />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-300">Behavior</h3>
        <ActionEditor action={button.action} ctx={ctx} onChange={(action) => set({ action })} />
        <div className="flex items-center gap-2">
          <button className="btn" onClick={runTest} disabled={test.state === "running" || button.action.type === "none"}>
            ▶ Test on PC
          </button>
          {test.state === "ok" && <span className="text-xs text-emerald-400">Done</span>}
          {test.state === "error" && <span className="text-xs text-red-400">{test.msg}</span>}
        </div>
      </section>

      <section className="space-y-3 border-t border-neutral-800 pt-4">
        <label className="flex items-center gap-2 text-sm font-semibold text-neutral-300 cursor-pointer">
          <input
            type="checkbox"
            className="accent-sky-500 w-4 h-4"
            checked={!!button.onState}
            onChange={(e) => set({ onState: e.target.checked ? { color: "#b91c1c" } : undefined })}
          />
          {live ? "Different look while on" : "Toggle button (two states)"}
        </label>
        <p className="text-xs text-neutral-500">
          {live
            ? button.action.type === "audio"
              ? "“On” means muted. The look follows the real mute state, even if you mute elsewhere."
              : "“On” follows OBS live: recording/streaming active, scene live, or input muted."
            : "Each press switches between the two states. Without a second look, an “on” button shows a red dot."}
          {live && !button.onState && " Without a custom look, an “on” button shows a red dot."}
        </p>
        {button.onState && (
          <div className="space-y-3 rounded-lg border border-neutral-800 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Look while on</h4>
            <AppearanceEditor value={button.onState} onChange={setOn} inherit={button} />
            {!live && (
              <div className="space-y-2 border-t border-neutral-800 pt-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-sky-500 w-4 h-4"
                    checked={!!button.onState.action}
                    onChange={(e) => setOn({ action: e.target.checked ? { type: "none" } : undefined })}
                  />
                  Run a different action when pressed while on
                </label>
                {button.onState.action && (
                  <ActionEditor
                    label="Action while on"
                    action={button.onState.action}
                    ctx={ctx}
                    onChange={(action) => setOn({ action })}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="space-y-2 border-t border-neutral-800 pt-4">
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={onDuplicate}>Duplicate</button>
          {moveTargets.length > 1 && (
            <select className="field w-auto" value="" onChange={(e) => e.target.value && onMove(e.target.value)}>
              <option value="">Move to…</option>
              {moveTargets
                .filter((t) => t.key !== location)
                .map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
            </select>
          )}
          <button className="btn btn-danger ml-auto" onClick={onDelete}>Delete</button>
        </div>
      </section>
    </div>
  );
};
