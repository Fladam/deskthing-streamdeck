import type { ProfileConfig } from "../shared/types";

export const DEFAULT_COLS = 4;
export const DEFAULT_ROWS = 2;

/** Starter layout used until the user saves their own (via the configurator, phase 3). */
export const defaultProfile: ProfileConfig = {
  id: "default",
  name: "Default",
  cols: DEFAULT_COLS,
  rows: DEFAULT_ROWS,
  pages: [
    {
      id: "media",
      name: "Media",
      buttons: [
        { id: "prev", icon: "⏮", label: "Previous", color: "#1f2937", action: { type: "media", key: "previous" } },
        { id: "playpause", icon: "⏯", label: "Play / Pause", color: "#065f46", action: { type: "media", key: "playpause" } },
        { id: "next", icon: "⏭", label: "Next", color: "#1f2937", action: { type: "media", key: "next" } },
        { id: "mute", icon: "🔇", label: "Mute", color: "#7f1d1d", action: { type: "media", key: "mute" } },
        { id: "voldown", icon: "🔉", label: "Vol -", color: "#1f2937", action: { type: "media", key: "volumedown" } },
        { id: "volup", icon: "🔊", label: "Vol +", color: "#1f2937", action: { type: "media", key: "volumeup" } },
        {
          id: "mic",
          icon: "🎤",
          label: "Mic",
          color: "#1f2937",
          action: { type: "audio", device: "mic", op: "toggle" },
          onState: { icon: "🔇", label: "Muted", color: "#7f1d1d" },
        },
        { id: "to-tools", icon: "➡", label: "Tools", color: "#312e81", action: { type: "page", target: "next" } },
      ],
    },
    {
      id: "tools",
      name: "Tools",
      buttons: [
        { id: "taskmgr", icon: "📊", label: "Task Mgr", color: "#1e3a8a", action: { type: "hotkey", keys: ["CTRL", "SHIFT", "ESC"] } },
        { id: "snip", icon: "✂", label: "Snip", color: "#1e3a8a", action: { type: "hotkey", keys: ["WIN", "SHIFT", "S"] } },
        { id: "explorer", icon: "📁", label: "Explorer", color: "#78350f", action: { type: "launch", path: "explorer.exe" } },
        { id: "lock", icon: "🔒", label: "Lock", color: "#7f1d1d", action: { type: "hotkey", keys: ["WIN", "L"] } },
        { id: "github", icon: "🌐", label: "GitHub", color: "#374151", action: { type: "url", url: "https://github.com" } },
        { id: "calc", icon: "🧮", label: "Calc", color: "#374151", action: { type: "launch", path: "calc.exe" } },
        { id: "shrug", icon: "🤷", label: "Shrug", color: "#374151", action: { type: "text", text: "¯\\_(ツ)_/¯" } },
        { id: "to-media", icon: "⬅", label: "Media", color: "#312e81", action: { type: "page", target: "previous" } },
      ],
    },
  ],
};
