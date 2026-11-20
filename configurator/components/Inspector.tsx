import React, { useRef, useState } from "react";
import { LIMITS, type ButtonConfig, type PageConfig } from "../../shared/types";
import { api } from "../api";
import { fileToIcon } from "../image";
import { ActionEditor } from "./ActionEditor";

const EMOJI = ["⭐", "▶", "⏯", "⏭", "🔊", "🔇", "🎤", "🎥", "🔴", "💬", "📁", "🌐", "🔒", "💡", "⚙", "🎮", "📷", "✂", "📋", "🧮"];

export const Inspector: React.FC<{
  button: ButtonConfig;
  pages: PageConfig[];
  pageIndex: number;
  onChange: (b: ButtonConfig) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveToPage: (pageIndex: number) => void;
}> = ({ button, pages, pageIndex, onChange, onDelete, onDuplicate, onMoveToPage }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [imgError, setImgError] = useState<string | null>(null);
  const [test, setTest] = useState<{ state: "idle" | "running" | "ok" | "error"; msg?: string }>({ state: "idle" });

  const set = (patch: Partial<ButtonConfig>) => onChange({ ...button, ...patch });

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
        <div>
          <label className="label">Label</label>
          <input
            className="field"
            maxLength={LIMITS.maxLabel}
            value={button.label ?? ""}
            onChange={(e) => set({ label: e.target.value })}
          />
        </div>

        <div>
          <label className="label">Icon</label>
          {button.image ? (
            <div className="flex items-center gap-3">
              <img src={button.image} alt="" className="w-14 h-14 object-contain rounded bg-neutral-800" />
              <button className="btn" onClick={() => fileRef.current?.click()}>Replace</button>
              <button className="btn" onClick={() => set({ image: undefined })}>Use emoji instead</button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  className="field text-2xl w-20 text-center"
                  maxLength={LIMITS.maxIcon}
                  value={button.icon ?? ""}
                  onChange={(e) => set({ icon: e.target.value })}
                />
                <button className="btn" onClick={() => fileRef.current?.click()}>Upload image…</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {EMOJI.map((em) => (
                  <button
                    key={em}
                    className="w-8 h-8 rounded hover:bg-neutral-800 text-lg"
                    onClick={() => set({ icon: em })}
                  >
                    {em}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-neutral-500">Tip: Win + . opens the Windows emoji picker.</p>
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
                set({ image: await fileToIcon(file) });
              } catch (err) {
                setImgError(err instanceof Error ? err.message : String(err));
              }
            }}
          />
          {imgError && <p className="mt-1 text-xs text-red-400">{imgError}</p>}
        </div>

        <div className="flex gap-4">
          <div>
            <label className="label">Background</label>
            <input
              type="color"
              className="h-9 w-16 rounded bg-transparent cursor-pointer"
              value={button.color ?? "#262626"}
              onChange={(e) => set({ color: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Text</label>
            <input
              type="color"
              className="h-9 w-16 rounded bg-transparent cursor-pointer"
              value={button.textColor ?? "#ffffff"}
              onChange={(e) => set({ textColor: e.target.value })}
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-300">Behavior</h3>
        <ActionEditor action={button.action} pages={pages} onChange={(action) => set({ action })} />
        <div className="flex items-center gap-2">
          <button className="btn" onClick={runTest} disabled={test.state === "running" || button.action.type === "none"}>
            ▶ Test on PC
          </button>
          {test.state === "ok" && <span className="text-xs text-emerald-400">Done</span>}
          {test.state === "error" && <span className="text-xs text-red-400">{test.msg}</span>}
        </div>
      </section>

      <section className="space-y-2 border-t border-neutral-800 pt-4">
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={onDuplicate}>Duplicate</button>
          {pages.length > 1 && (
            <select
              className="field w-auto"
              value=""
              onChange={(e) => e.target.value !== "" && onMoveToPage(Number(e.target.value))}
            >
              <option value="">Move to page…</option>
              {pages.map((p, i) =>
                i === pageIndex ? null : (
                  <option key={p.id} value={i}>
                    {i + 1}. {p.name}
                  </option>
                )
              )}
            </select>
          )}
          <button className="btn btn-danger ml-auto" onClick={onDelete}>Delete</button>
        </div>
      </section>
    </div>
  );
};
