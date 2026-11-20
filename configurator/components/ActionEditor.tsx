import React from "react";
import type { ActionConfig, ActionType, MediaKey, PageConfig } from "../../shared/types";
import { ACTION_LABELS, defaultAction } from "../model";
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

/** Strip the quotes Windows adds with "Copy as path". */
const unquote = (s: string) => s.trim().replace(/^"(.*)"$/, "$1");

export const ActionEditor: React.FC<{
  action: ActionConfig;
  pages: PageConfig[];
  onChange: (a: ActionConfig) => void;
}> = ({ action, pages, onChange }) => {
  return (
    <div className="space-y-3">
      <div>
        <label className="label">Action</label>
        <select
          className="field"
          value={action.type}
          onChange={(e) => onChange(defaultAction(e.target.value as ActionType))}
        >
          {(Object.keys(ACTION_LABELS) as ActionType[]).map((t) => (
            <option key={t} value={t}>
              {ACTION_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {action.type === "hotkey" && (
        <div>
          <label className="label">Keys</label>
          <HotkeyInput keys={action.keys} onChange={(keys) => onChange({ ...action, keys })} />
        </div>
      )}

      {action.type === "media" && (
        <div>
          <label className="label">Key</label>
          <select
            className="field"
            value={action.key}
            onChange={(e) => onChange({ ...action, key: e.target.value as MediaKey })}
          >
            {(Object.keys(MEDIA_LABELS) as MediaKey[]).map((k) => (
              <option key={k} value={k}>
                {MEDIA_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
      )}

      {action.type === "launch" && (
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
      )}

      {action.type === "url" && (
        <div>
          <label className="label">URL</label>
          <input
            className="field font-mono"
            value={action.url}
            placeholder="https://…  steam://…  spotify:"
            onChange={(e) => onChange({ ...action, url: e.target.value.trim() })}
          />
        </div>
      )}

      {action.type === "command" && (
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
      )}

      {action.type === "text" && (
        <div>
          <label className="label">Text to type</label>
          <textarea
            className="field h-24"
            value={action.text}
            onChange={(e) => onChange({ ...action, text: e.target.value })}
          />
        </div>
      )}

      {action.type === "page" && (
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
            {pages.map((p, i) => (
              <option key={p.id} value={i}>
                {i + 1}. {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};
