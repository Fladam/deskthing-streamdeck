import type {
  ActionConfig,
  ActionType,
  ButtonConfig,
  ObsStatus,
  PageConfig,
  ProfileConfig,
  StepConfig,
  StepType,
} from "../shared/types";

export const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

/** Everything an action editor needs to offer choices. */
export interface EditorContext {
  pages: PageConfig[];
  folders: PageConfig[];
  obs: ObsStatus | null;
}

export const ACTION_LABELS: Record<ActionType, string> = {
  none: "None",
  hotkey: "Hotkey",
  media: "Media key",
  launch: "Open app / file / folder",
  url: "Open URL",
  command: "Run command",
  text: "Type text",
  multi: "Multi-action (several steps)",
  page: "Go to page",
  folder: "Open folder",
  back: "Back (leave folder)",
  obs: "OBS",
  audio: "Mute mic / speakers",
};

export const STEP_LABELS: Record<StepType, string> = (() => {
  const { multi: _multi, ...rest } = ACTION_LABELS;
  return { ...rest, delay: "Wait" } as Record<StepType, string>;
})();

export function defaultAction(type: ActionType, ctx?: EditorContext): ActionConfig {
  switch (type) {
    case "hotkey": return { type, keys: [] };
    case "media": return { type, key: "playpause" };
    case "launch": return { type, path: "" };
    case "url": return { type, url: "https://" };
    case "command": return { type, command: "", shell: "powershell" };
    case "text": return { type, text: "" };
    case "page": return { type, target: "next" };
    case "folder": return { type, folderId: ctx?.folders[0]?.id ?? "" };
    case "back": return { type };
    case "obs": return { type, op: "record" };
    case "audio": return { type, device: "mic", op: "toggle" };
    case "multi": return { type, steps: [{ type: "none" }] };
    default: return { type: "none" };
  }
}

export function defaultStep(type: StepType, ctx?: EditorContext): StepConfig {
  return type === "delay" ? { type, ms: 500 } : (defaultAction(type, ctx) as StepConfig);
}

export const blankButton = (): ButtonConfig => ({
  id: newId("b"),
  label: "",
  icon: "⭐",
  color: "#262626",
  textColor: "#ffffff",
  action: { type: "none" },
});

export const backButton = (): ButtonConfig => ({
  id: newId("b"),
  label: "Back",
  icon: "⬅",
  color: "#312e81",
  textColor: "#ffffff",
  action: { type: "back" },
});

/** Deep-copy a button with fresh ids. */
export const cloneButton = (b: ButtonConfig): ButtonConfig => ({ ...structuredClone(b), id: newId("b") });

export const blankPage = (slots: number, n: number): PageConfig => ({
  id: newId("p"),
  name: `Page ${n}`,
  buttons: Array(slots).fill(null),
});

/** New folders start with a Back button in the first slot. */
export const blankFolder = (slots: number, n: number): PageConfig => ({
  id: newId("f"),
  name: `Folder ${n}`,
  buttons: [backButton(), ...Array(slots - 1).fill(null)],
});

/** Re-grid a profile, keeping each button at the same row/column. Reports how many buttons don't fit. */
export function resizeGrid(profile: ProfileConfig, cols: number, rows: number) {
  let lost = 0;
  const regrid = (page: PageConfig): PageConfig => {
    const buttons: (ButtonConfig | null)[] = Array(cols * rows).fill(null);
    page.buttons.forEach((b, i) => {
      if (!b) return;
      const r = Math.floor(i / profile.cols);
      const c = i % profile.cols;
      if (r < rows && c < cols) buttons[r * cols + c] = b;
      else lost++;
    });
    return { ...page, buttons };
  };
  return {
    profile: { ...profile, cols, rows, pages: profile.pages.map(regrid), folders: profile.folders?.map(regrid) },
    lost,
  };
}

/** Replace every action that opens `folderId` with "none" (used when a folder is deleted). */
export function removeFolderRefs(profile: ProfileConfig, folderId: string): ProfileConfig {
  const fix = <T extends ActionConfig | StepConfig>(a: T): T => {
    if (a.type === "folder" && a.folderId === folderId) return { type: "none" } as T;
    if (a.type === "multi") return { ...a, steps: a.steps.map(fix) } as T;
    return a;
  };
  const fixButton = (b: ButtonConfig | null) =>
    b && {
      ...b,
      action: fix(b.action),
      onState: b.onState && { ...b.onState, action: b.onState.action && fix(b.onState.action) },
    };
  const fixPage = (p: PageConfig) => ({ ...p, buttons: p.buttons.map(fixButton) });
  return { ...profile, pages: profile.pages.map(fixPage), folders: profile.folders?.map(fixPage) };
}

const OBS_OP_LABELS = { record: "Toggle recording", stream: "Toggle streaming", virtualcam: "Toggle virtual camera" };

/** Describe an action in a few words, for tooltips. */
export function describeAction(a: ActionConfig | StepConfig, ctx?: EditorContext): string {
  switch (a.type) {
    case "hotkey": return a.keys.join(" + ") || "Hotkey (empty)";
    case "media": return `Media: ${a.key}`;
    case "launch": return a.path || "Open (empty)";
    case "url": return a.url;
    case "command": return a.command || "Command (empty)";
    case "text": return `Type "${a.text}"`;
    case "page": return typeof a.target === "number" ? `Page ${a.target + 1}` : `${a.target} page`;
    case "folder": return `Open folder ${ctx?.folders.find((f) => f.id === a.folderId)?.name ?? ""}`.trim();
    case "back": return "Back";
    case "obs":
      if (a.op === "scene") return `OBS scene: ${a.scene}`;
      if (a.op === "mute") return `OBS mute: ${a.input}`;
      return `OBS: ${OBS_OP_LABELS[a.op]}`;
    case "audio": return `${a.op} ${a.device}`;
    case "multi": return `${a.steps.length} steps: ${a.steps.map((s) => describeAction(s, ctx)).join(" → ")}`;
    case "delay": return `Wait ${a.ms} ms`;
    default: return "No action";
  }
}

/**
 * Copy page `index` of a template profile into `target`, with fresh ids, the
 * folders it opens (recursively), and re-gridded to the target's size.
 */
export function addTemplatePage(target: ProfileConfig, template: ProfileConfig, index: number): ProfileConfig {
  const fitted = resizeGrid(template, target.cols, target.rows).profile;
  const tplFolders = fitted.folders ?? [];
  const folderMap = new Map<string, string>();

  const collect = (page: PageConfig) => {
    for (const b of page.buttons) {
      if (!b) continue;
      for (const a of [b.action, b.onState?.action, ...(b.action.type === "multi" ? b.action.steps : [])]) {
        if (a?.type === "folder" && !folderMap.has(a.folderId)) {
          const f = tplFolders.find((x) => x.id === a.folderId);
          if (f) {
            folderMap.set(a.folderId, newId("f"));
            collect(f);
          }
        }
      }
    }
  };
  const remap = <T extends ActionConfig | StepConfig>(a: T): T => {
    if (a.type === "folder") return { ...a, folderId: folderMap.get(a.folderId) ?? a.folderId } as T;
    if (a.type === "multi") return { ...a, steps: a.steps.map(remap) } as T;
    return a;
  };
  const copyPage = (p: PageConfig, id: string): PageConfig => ({
    id,
    name: p.name,
    buttons: p.buttons.map(
      (b) =>
        b && {
          ...structuredClone(b),
          id: newId("b"),
          action: remap(structuredClone(b.action)),
          onState: b.onState && { ...structuredClone(b.onState), action: b.onState.action && remap(structuredClone(b.onState.action)) },
        }
    ),
  });

  const page = fitted.pages[index];
  collect(page);
  const taken = new Set((target.folders ?? []).map((f) => f.name));
  const uniqueName = (name: string) => {
    let n = name;
    for (let i = 2; taken.has(n); i++) n = `${name} ${i}`;
    taken.add(n);
    return n;
  };
  const newFolders = [...folderMap].map(([oldId, nid]) => {
    const copy = copyPage(tplFolders.find((f) => f.id === oldId)!, nid);
    return { ...copy, name: uniqueName(copy.name) };
  });
  return {
    ...target,
    pages: [...target.pages, copyPage(page, newId("p"))],
    folders: [...(target.folders ?? []), ...newFolders],
  };
}
