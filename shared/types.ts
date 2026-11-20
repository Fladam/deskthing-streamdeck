// Types shared between the server (PC) and the client (Car Thing UI).

export type MediaKey =
  | "playpause"
  | "next"
  | "previous"
  | "stop"
  | "volumeup"
  | "volumedown"
  | "mute";

export type ActionConfig =
  /** Key combo, e.g. ["CTRL", "SHIFT", "ESC"]. Keys are pressed in order and released in reverse. */
  | { type: "hotkey"; keys: string[] }
  /** Launch an exe (with optional args), or open any file / folder / shortcut with its default handler. */
  | { type: "launch"; path: string; args?: string[] }
  /** Open a URL (http(s), or any registered protocol such as steam:// or spotify:). */
  | { type: "url"; url: string }
  /** Run a shell command (fire-and-forget). */
  | { type: "command"; command: string; shell?: "powershell" | "cmd" }
  | { type: "media"; key: MediaKey }
  /** Type a string of text into the focused window. */
  | { type: "text"; text: string }
  /** Navigate between pages of the current profile. */
  | { type: "page"; target: "next" | "previous" | number }
  | { type: "none" };

export type ActionType = ActionConfig["type"];

export interface ButtonConfig {
  id: string;
  label?: string;
  /** Emoji or short text shown large in the button. */
  icon?: string;
  /** Image icon as a data: URL (takes precedence over `icon`). */
  image?: string;
  /** Background color (CSS). */
  color?: string;
  /** Label / icon color (CSS). */
  textColor?: string;
  action: ActionConfig;
}

export interface PageConfig {
  id: string;
  name: string;
  /** Slot array of length cols * rows, row-major. null = empty slot. */
  buttons: (ButtonConfig | null)[];
}

export interface ProfileConfig {
  id: string;
  name: string;
  cols: number;
  rows: number;
  pages: PageConfig[];
}

/** What the client needs to draw one button (no action details leave the server). */
export interface ButtonView {
  id: string;
  label?: string;
  icon?: string;
  image?: string;
  color?: string;
  textColor?: string;
}

export interface DeckView {
  profileName: string;
  cols: number;
  rows: number;
  pageIndex: number;
  pageCount: number;
  pageName: string;
  buttons: (ButtonView | null)[];
}

// ---- Messages -------------------------------------------------------------

/** All client -> server messages use type "deck". */
export const DECK_MSG = "deck";

export type ClientToServer =
  | { type: typeof DECK_MSG; request: "getView" }
  | { type: typeof DECK_MSG; request: "press"; payload: { buttonId: string } }
  | { type: typeof DECK_MSG; request: "page"; payload: { delta: number } | { index: number } }
  /** Ask the server to open the web configurator in the PC's browser. */
  | { type: typeof DECK_MSG; request: "openConfigurator" };

export type ServerToClient =
  | { type: "view"; payload: DeckView }
  | { type: "pressResult"; payload: { buttonId: string; ok: boolean; error?: string } };

// ---- Limits (enforced by the server, mirrored in the configurator) --------

export const LIMITS = {
  minCols: 1,
  maxCols: 8,
  minRows: 1,
  maxRows: 5,
  maxPages: 50,
  maxLabel: 40,
  maxIcon: 16,
  /** Max size of one image data URL, in characters. */
  maxImage: 300_000,
} as const;

export const DEFAULT_CONFIG_PORT = 8899;

/** Ports DeskThing itself uses (device connection, OAuth callback). Never bind these. */
export const RESERVED_PORTS: readonly number[] = [8891, 8888];
