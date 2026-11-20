// Types shared between the server (PC) and the client (Car Thing UI).

export type MediaKey =
  | "playpause"
  | "next"
  | "previous"
  | "stop"
  | "volumeup"
  | "volumedown"
  | "mute";

export type ObsAction =
  /** Switch the program scene. Live state: the scene is currently live. */
  | { type: "obs"; op: "scene"; scene: string }
  /** Toggle recording / streaming / virtual camera. Live state: output active. */
  | { type: "obs"; op: "record" | "stream" | "virtualcam" }
  /** Toggle mute on an audio input (e.g. "Mic/Aux"). Live state: muted. */
  | { type: "obs"; op: "mute"; input: string };

export type ObsOp = ObsAction["op"];

export type AudioDevice = "mic" | "speakers";
export type AudioOp = "toggle" | "mute" | "unmute";

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
  /** Open a folder (a hidden sub-page). */
  | { type: "folder"; folderId: string }
  /** Leave the current folder. */
  | { type: "back" }
  | ObsAction
  /** Mute / unmute the default microphone or speakers. Live state: muted. */
  | { type: "audio"; device: AudioDevice; op: AudioOp }
  /** Run several steps in order. */
  | { type: "multi"; steps: StepConfig[] }
  | { type: "none" };

/** One step of a multi-action: any non-multi action, or a pause. */
export type StepConfig = Exclude<ActionConfig, { type: "multi" }> | { type: "delay"; ms: number };

export type ActionType = ActionConfig["type"];
export type StepType = StepConfig["type"];

/** Action types whose on/off state is read from the real world (OBS, Windows audio). */
export const LIVE_STATE_TYPES: readonly ActionType[] = ["obs", "audio"];
export const hasLiveState = (a: ActionConfig) => LIVE_STATE_TYPES.includes(a.type);

export interface Appearance {
  label?: string;
  /** Emoji or short text shown large in the button. */
  icon?: string;
  /** Image icon as a data: URL (takes precedence over `icon`). */
  image?: string;
  /** Background color (CSS). */
  color?: string;
  /** Label / icon color (CSS). */
  textColor?: string;
}

export interface OnState extends Appearance {
  /**
   * Manual toggles only (actions without live state): what to run when pressed
   * while "on". Omitted = run the main action again.
   */
  action?: ActionConfig;
}

export interface ButtonConfig extends Appearance {
  id: string;
  action: ActionConfig;
  /**
   * Optional second state. Fields here override the normal look while the
   * button is "on". For OBS / audio actions "on" follows the live state;
   * for anything else the button becomes a manual toggle.
   */
  onState?: OnState;
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
  /** Hidden pages opened by "folder" actions. */
  folders?: PageConfig[];
}

/** What the client needs to draw one button (no action details leave the server). */
export interface ButtonView extends Appearance {
  id: string;
  /** Show a small "active" dot (button is on but has no custom on-look). */
  indicator?: boolean;
}

export interface DeckView {
  profileName: string;
  cols: number;
  rows: number;
  pageIndex: number;
  pageCount: number;
  pageName: string;
  /** Set when a folder is open (pageName is then the folder name). */
  inFolder?: boolean;
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

// ---- App settings (edited in the configurator) ----------------------------

export interface ObsSettings {
  enabled: boolean;
  host: string;
  port: number;
  password: string;
}

export interface AppSettingsData {
  obs: ObsSettings;
}

/** What the configurator sees: the password is never sent back. */
export interface PublicSettings {
  obs: Omit<ObsSettings, "password"> & { hasPassword: boolean };
}

/** Settings update from the configurator; password omitted = keep the current one. */
export interface SettingsUpdate {
  obs: Omit<ObsSettings, "password"> & { password?: string };
}

export const DEFAULT_SETTINGS: AppSettingsData = {
  obs: { enabled: false, host: "127.0.0.1", port: 4455, password: "" },
};

export interface ObsStatus {
  enabled: boolean;
  connected: boolean;
  error?: string;
  scenes: string[];
  inputs: string[];
}

// ---- Limits (enforced by the server, mirrored in the configurator) --------

export const LIMITS = {
  minCols: 1,
  maxCols: 8,
  minRows: 1,
  maxRows: 5,
  maxPages: 50,
  maxFolders: 50,
  maxLabel: 40,
  maxIcon: 16,
  maxSteps: 20,
  maxDelayMs: 60_000,
  /** Max size of one image data URL, in characters. */
  maxImage: 300_000,
} as const;

export const DEFAULT_CONFIG_PORT = 8899;

/** DeskThing app setting (boolean): whether turning the dial flips pages. */
export const DIAL_PAGES_SETTING = "dialPages";

/** Ports DeskThing itself uses (device connection, OAuth callback). Never bind these. */
export const RESERVED_PORTS: readonly number[] = [8891, 8888];
