import React, { useId } from "react";
import {
  LIMITS,
  type ActionConfig,
  type ActionType,
  type AudioDevice,
  type AudioOp,
  type MediaKey,
  type ObsOp,
  type StepConfig,
  type StepType,
} from "../../shared/types";
import { ACTION_LABELS, STEP_LABELS, defaultAction, defaultStep, type EditorContext } from "../model";
import { HotkeyInput } from "./HotkeyInput";

const MEDIA_LABELS: Record<MediaKey, string> = {
  playpause: "Play / Pause",
  next: "Next track",
  previous: "Previous track",
  stop: "Stop",
  volumeup: "Volume up",
  volumedown: "Volume down",
  mute: "Mute",
};

const OBS_OPS: Record<ObsOp, string> = {
  scene: "Switch scene",
  record: "Toggle recording",
  stream: "Toggle streaming",
  virtualcam: "Toggle virtual camera",
  mute: "Toggle input mute",
};

/** Strip the quotes Windows adds with "Copy as path". */
const unquote = (s: string) => s.trim().replace(/^"(.*)"$/, "$1");

type Leaf = Exclude<ActionConfig, { type: "multi" }>;

/** Fields for one non-multi action. */
const ActionFields: React.FC<{ action: Leaf; ctx: EditorContext; onChange: (a: Leaf) => void }> = ({
  action,
  ctx,
  onChange,
}) => {
  const listId = useId();
  switch (action.type) {
    case "hotkey":
      return (
        <div>
          <label className="label">Keys</label>
          <HotkeyInput keys={action.keys} onChange={(keys) => onChange({ ...action, keys })} />
        </div>
      );

    case "media":
      return (
        <div>
          <label className="label">Key</label>
          <select className="field" value={action.key} onChange={(e) => onChange({ ...action, key: e.target.value as MediaKey })}>
            {(Object.keys(MEDIA_LABELS) as MediaKey[]).map((k) => (
              <option key={k} value={k}>{MEDIA_LABELS[k]}</option>
            ))}
          </select>
        </div>
      );

    case "launch":
      return (
        <>
          <div>
            <label className="label">Path</label>
            <input
              className="field font-mono"
              value={action.path}
              placeholder="C:\Program Files\App\app.exe  or  notepad.exe  or  D:\Folder"
              onChange={(e) => onChange({ ...action, path: unquote(e.target.value) })}
            />
            <p className="mt-1 text-xs text-neutral-500">
              Tip: Shift + right-click a file in Explorer → “Copy as path”. Shortcuts (.lnk), folders and documents work too.
            </p>
          </div>
          <div>
            <label className="label">Arguments (one per line, .exe only)</label>
            <textarea
              className="field font-mono h-16"
              value={(action.args ?? []).join("\n")}
              onChange={(e) => {
                const args = e.target.value.split("\n");
                onChange({ ...action, args: args.length === 1 && !args[0] ? undefined : args });
              }}
            />
          </div>
        </>
      );

    case "url":
      return (
        <div>
          <label className="label">URL</label>
          <input
            className="field font-mono"
            value={action.url}
            placeholder="https://…  steam://…  spotify:"
            onChange={(e) => onChange({ ...action, url: e.target.value.trim() })}
          />
        </div>
      );

    case "command":
      return (
        <>
          <div>
            <label className="label">Shell</label>
            <select
              className="field"
              value={action.shell ?? "powershell"}
              onChange={(e) => onChange({ ...action, shell: e.target.value as "powershell" | "cmd" })}
            >
              <option value="powershell">PowerShell</option>
              <option value="cmd">Command Prompt (cmd)</option>
            </select>
          </div>
          <div>
            <label className="label">Command</label>
            <textarea
              className="field font-mono h-24"
              value={action.command}
              placeholder={action.shell === "cmd" ? "start notepad" : "Get-Process | Out-File $env:TEMP\\procs.txt"}
              onChange={(e) => onChange({ ...action, command: e.target.value })}
            />
            <p className="mt-1 text-xs text-neutral-500">Runs in the background (no window) on this PC.</p>
          </div>
        </>
      );

    case "text":
      return (
        <div>
          <label className="label">Text to type</label>
          <textarea className="field h-24" value={action.text} onChange={(e) => onChange({ ...action, text: e.target.value })} />
        </div>
      );

    case "page":
      return (
        <div>
          <label className="label">Target</label>
          <select
            className="field"
            value={String(action.target)}
            onChange={(e) => {
              const v = e.target.value;
              onChange({ ...action, target: v === "next" || v === "previous" ? v : Number(v) });
            }}
          >
            <option value="next">Next page</option>
            <option value="previous">Previous page</option>
            {ctx.pages.map((p, i) => (
              <option key={p.id} value={i}>{i + 1}. {p.name}</option>
            ))}
          </select>
        </div>
      );

    case "folder":
      return ctx.folders.length ? (
        <div>
          <label className="label">Folder</label>
          <select className="field" value={action.folderId} onChange={(e) => onChange({ ...action, folderId: e.target.value })}>
            {!ctx.folders.some((f) => f.id === action.folderId) && <option value="">Choose a folder…</option>}
            {ctx.folders.map((f) => (
              <option key={f.id} value={f.id}>📁 {f.name}</option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-sm text-amber-400">No folders yet. Create one with “+ Folder” above the grid.</p>
      );

    case "back":
      return <p className="text-xs text-neutral-500">Returns from a folder to where it was opened.</p>;

    case "obs": {
      const obs = ctx.obs;
      return (
        <>
          <div>
            <label className="label">OBS action</label>
            <select
              className="field"
              value={action.op}
              onChange={(e) => {
                const op = e.target.value as ObsOp;
                if (op === "scene") onChange({ type: "obs", op, scene: obs?.scenes[0] ?? "" });
                else if (op === "mute") onChange({ type: "obs", op, input: obs?.inputs[0] ?? "" });
                else onChange({ type: "obs", op });
              }}
            >
              {(Object.keys(OBS_OPS) as ObsOp[]).map((op) => (
                <option key={op} value={op}>{OBS_OPS[op]}</option>
              ))}
            </select>
          </div>
          {action.op === "scene" && (
            <div>
              <label className="label">Scene</label>
              <input className="field" list={listId} value={action.scene} onChange={(e) => onChange({ ...action, scene: e.target.value })} />
              <datalist id={listId}>{obs?.scenes.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
          )}
          {action.op === "mute" && (
            <div>
              <label className="label">Audio input</label>
              <input className="field" list={listId} value={action.input} onChange={(e) => onChange({ ...action, input: e.target.value })} />
              <datalist id={listId}>{obs?.inputs.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
          )}
          {!obs?.connected && (
            <p className="text-xs text-amber-400">
              {obs?.enabled ? `OBS isn't connected${obs.error ? `: ${obs.error}` : ""}.` : "OBS is turned off. Set it up under ⚙ Settings."}
            </p>
          )}
        </>
      );
    }

    case "audio":
      return (
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="label">Device</label>
            <select className="field" value={action.device} onChange={(e) => onChange({ ...action, device: e.target.value as AudioDevice })}>
              <option value="mic">Default microphone</option>
              <option value="speakers">Default speakers</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="label">Do</label>
            <select className="field" value={action.op} onChange={(e) => onChange({ ...action, op: e.target.value as AudioOp })}>
              <option value="toggle">Toggle mute</option>
              <option value="mute">Mute</option>
              <option value="unmute">Unmute</option>
            </select>
          </div>
        </div>
      );

    default:
      return null;
  }
};

const StepsEditor: React.FC<{ steps: StepConfig[]; ctx: EditorContext; onChange: (s: StepConfig[]) => void }> = ({
  steps,
  ctx,
  onChange,
}) => {
  const set = (i: number, s: StepConfig) => onChange(steps.map((x, j) => (j === i ? s : x)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...steps];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <label className="label">Steps (run in order)</label>
      {steps.map((step, i) => (
        <div key={i} className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-2.5 space-y-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-neutral-500 w-5">{i + 1}.</span>
            <select
              className="field flex-1"
              value={step.type}
              onChange={(e) => set(i, defaultStep(e.target.value as StepType, ctx))}
            >
              {(Object.keys(STEP_LABELS) as StepType[]).map((t) => (
                <option key={t} value={t}>{STEP_LABELS[t]}</option>
              ))}
            </select>
            <button className="btn px-2" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">↑</button>
            <button className="btn px-2" disabled={i === steps.length - 1} onClick={() => move(i, 1)} title="Move down">↓</button>
            <button className="btn px-2" disabled={steps.length === 1} onClick={() => onChange(steps.filter((_, j) => j !== i))} title="Remove step">✕</button>
          </div>
          {step.type === "delay" ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="field w-28"
                min={0}
                max={LIMITS.maxDelayMs}
                step={100}
                value={step.ms}
                onChange={(e) => set(i, { type: "delay", ms: Math.max(0, Math.min(LIMITS.maxDelayMs, Math.round(Number(e.target.value) || 0))) })}
              />
              <span className="text-sm text-neutral-400">milliseconds</span>
            </div>
          ) : (
            <ActionFields action={step} ctx={ctx} onChange={(a) => set(i, a as StepConfig)} />
          )}
        </div>
      ))}
      <button className="btn" disabled={steps.length >= LIMITS.maxSteps} onClick={() => onChange([...steps, { type: "none" }])}>
        + Add step
      </button>
    </div>
  );
};

export const ActionEditor: React.FC<{
  action: ActionConfig;
  ctx: EditorContext;
  onChange: (a: ActionConfig) => void;
  label?: string;
}> = ({ action, ctx, onChange, label = "Action" }) => (
  <div className="space-y-3">
    <div>
      <label className="label">{label}</label>
      <select className="field" value={action.type} onChange={(e) => onChange(defaultAction(e.target.value as ActionType, ctx))}>
        {(Object.keys(ACTION_LABELS) as ActionType[]).map((t) => (
          <option key={t} value={t}>{ACTION_LABELS[t]}</option>
        ))}
      </select>
    </div>
    {action.type === "multi" ? (
      <StepsEditor steps={action.steps} ctx={ctx} onChange={(steps) => onChange({ type: "multi", steps })} />
    ) : (
      <ActionFields action={action} ctx={ctx} onChange={onChange} />
    )}
  </div>
);
