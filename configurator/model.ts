import type { ActionConfig, ActionType, ButtonConfig, PageConfig, ProfileConfig } from "../shared/types";

export const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

export const ACTION_LABELS: Record<ActionType, string> = {
  none: "None",
  hotkey: "Hotkey",
  media: "Media key",
  launch: "Open app / file / folder",
  url: "Open URL",
  command: "Run command",
  text: "Type text",
  page: "Go to page",
};

export function defaultAction(type: ActionType): ActionConfig {
  switch (type) {
    case "hotkey": return { type, keys: [] };
    case "media": return { type, key: "playpause" };
    case "launch": return { type, path: "" };
    case "url": return { type, url: "https://" };
    case "command": return { type, command: "", shell: "powershell" };
    case "text": return { type, text: "" };
    case "page": return { type, target: "next" };
    default: return { type: "none" };
  }
}

export const blankButton = (): ButtonConfig => ({
  id: newId("b"),
  label: "",
  icon: "⭐",
  color: "#262626",
  textColor: "#ffffff",
  action: { type: "none" },
});

export const cloneButton = (b: ButtonConfig): ButtonConfig => ({ ...structuredClone(b), id: newId("b") });

export const blankPage = (slots: number, n: number): PageConfig => ({
  id: newId("p"),
  name: `Page ${n}`,
  buttons: Array(slots).fill(null),
});

/** Re-grid a profile, keeping each button at the same row/column. Reports how many buttons don't fit. */
export function resizeGrid(profile: ProfileConfig, cols: number, rows: number) {
  let lost = 0;
  const pages = profile.pages.map((page) => {
    const buttons: (ButtonConfig | null)[] = Array(cols * rows).fill(null);
    page.buttons.forEach((b, i) => {
      if (!b) return;
      const r = Math.floor(i / profile.cols);
      const c = i % profile.cols;
      if (r < rows && c < cols) buttons[r * cols + c] = b;
      else lost++;
    });
    return { ...page, buttons };
  });
  return { profile: { ...profile, cols, rows, pages }, lost };
}

/** Describe an action in a few words, for tooltips and the slot list. */
export function describeAction(a: ActionConfig): string {
  switch (a.type) {
    case "hotkey": return a.keys.join(" + ") || "Hotkey (empty)";
    case "media": return `Media: ${a.key}`;
    case "launch": return a.path || "Open (empty)";
    case "url": return a.url;
    case "command": return a.command || "Command (empty)";
    case "text": return `Type "${a.text}"`;
    case "page": return typeof a.target === "number" ? `Page ${a.target + 1}` : `${a.target} page`;
    default: return "No action";
  }
}
