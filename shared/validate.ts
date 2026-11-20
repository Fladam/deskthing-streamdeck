// Strict validation for profiles / settings coming from the configurator (or imported JSON).
// Returns a cleaned copy containing only known fields; throws ValidationError otherwise.

import { isValidKeyName } from "./keys";
import {
  LIMITS,
  type ActionConfig,
  type Appearance,
  type AudioDevice,
  type AudioOp,
  type ButtonConfig,
  type MediaKey,
  type OnState,
  type PageConfig,
  type ProfileConfig,
  type SettingsUpdate,
  type StepConfig,
} from "./types";

export class ValidationError extends Error {}

const MEDIA_KEYS: MediaKey[] = ["playpause", "next", "previous", "stop", "volumeup", "volumedown", "mute"];
const AUDIO_DEVICES: AudioDevice[] = ["mic", "speakers"];
const AUDIO_OPS: AudioOp[] = ["toggle", "mute", "unmute"];
const IMAGE_RE = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20})$/;

const fail = (path: string, msg: string): never => {
  throw new ValidationError(`${path}: ${msg}`);
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function str(v: unknown, path: string, opts: { max?: number; optional?: boolean; nonEmpty?: boolean } = {}): string | undefined {
  if (v === undefined || v === null || v === "") {
    if (opts.optional) return undefined;
    if (v === "" && !opts.nonEmpty) return "";
    return fail(path, "is required");
  }
  if (typeof v !== "string") return fail(path, "must be a string");
  if (opts.max !== undefined && v.length > opts.max) fail(path, `must be at most ${opts.max} characters`);
  return v;
}

function int(v: unknown, path: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) fail(path, `must be an integer ${min}-${max}`);
  return v as number;
}

function validateStep(v: unknown, path: string): StepConfig {
  if (isObj(v) && v.type === "delay") return { type: "delay", ms: int(v.ms, `${path}.ms`, 0, LIMITS.maxDelayMs) };
  if (isObj(v) && v.type === "multi") return fail(`${path}.type`, "multi-actions can't be nested");
  return validateAction(v, path) as StepConfig;
}

export function validateAction(v: unknown, path = "action"): ActionConfig {
  if (!isObj(v)) return fail(path, "must be an object");
  switch (v.type) {
    case "none":
      return { type: "none" };
    case "hotkey": {
      if (!Array.isArray(v.keys) || v.keys.length === 0 || v.keys.length > 6) fail(`${path}.keys`, "must list 1-6 keys");
      const keys = (v.keys as unknown[]).map((k, i) => {
        const s = str(k, `${path}.keys[${i}]`, { max: 20, nonEmpty: true })!;
        if (!isValidKeyName(s)) fail(`${path}.keys[${i}]`, `unknown key "${s}"`);
        return s.toUpperCase();
      });
      return { type: "hotkey", keys };
    }
    case "media":
      if (!MEDIA_KEYS.includes(v.key as MediaKey)) fail(`${path}.key`, `must be one of ${MEDIA_KEYS.join(", ")}`);
      return { type: "media", key: v.key as MediaKey };
    case "launch": {
      const p = str(v.path, `${path}.path`, { max: 1000, nonEmpty: true })!;
      let args: string[] | undefined;
      if (v.args !== undefined) {
        if (!Array.isArray(v.args) || v.args.length > 50) fail(`${path}.args`, "must be a list of up to 50 strings");
        args = (v.args as unknown[]).map((a, i) => str(a, `${path}.args[${i}]`, { max: 1000 })!);
      }
      return args && args.length ? { type: "launch", path: p, args } : { type: "launch", path: p };
    }
    case "url": {
      const url = str(v.url, `${path}.url`, { max: 2000, nonEmpty: true })!;
      if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) fail(`${path}.url`, "must start with a scheme like https://");
      return { type: "url", url };
    }
    case "command": {
      const command = str(v.command, `${path}.command`, { max: 5000, nonEmpty: true })!;
      const shell = v.shell === undefined ? "powershell" : v.shell;
      if (shell !== "powershell" && shell !== "cmd") fail(`${path}.shell`, 'must be "powershell" or "cmd"');
      return { type: "command", command, shell: shell as "powershell" | "cmd" };
    }
    case "text":
      return { type: "text", text: str(v.text, `${path}.text`, { max: 5000, nonEmpty: true })! };
    case "page": {
      if (v.target === "next" || v.target === "previous") return { type: "page", target: v.target };
      return { type: "page", target: int(v.target, `${path}.target`, 0, LIMITS.maxPages - 1) };
    }
    case "folder":
      return { type: "folder", folderId: str(v.folderId, `${path}.folderId`, { max: 64, nonEmpty: true })! };
    case "back":
      return { type: "back" };
    case "obs":
      switch (v.op) {
        case "scene":
          return { type: "obs", op: "scene", scene: str(v.scene, `${path}.scene`, { max: 200, nonEmpty: true })! };
        case "mute":
          return { type: "obs", op: "mute", input: str(v.input, `${path}.input`, { max: 200, nonEmpty: true })! };
        case "record":
        case "stream":
        case "virtualcam":
          return { type: "obs", op: v.op };
        default:
          return fail(`${path}.op`, `unknown OBS operation "${String(v.op)}"`);
      }
    case "audio":
      if (!AUDIO_DEVICES.includes(v.device as AudioDevice)) fail(`${path}.device`, 'must be "mic" or "speakers"');
      if (!AUDIO_OPS.includes(v.op as AudioOp)) fail(`${path}.op`, `must be one of ${AUDIO_OPS.join(", ")}`);
      return { type: "audio", device: v.device as AudioDevice, op: v.op as AudioOp };
    case "multi": {
      if (!Array.isArray(v.steps) || v.steps.length === 0 || v.steps.length > LIMITS.maxSteps)
        fail(`${path}.steps`, `must have 1-${LIMITS.maxSteps} steps`);
      return { type: "multi", steps: (v.steps as unknown[]).map((s, i) => validateStep(s, `${path}.steps[${i}]`)) };
    }
    default:
      return fail(`${path}.type`, `unknown action type "${String(v.type)}"`);
  }
}

function validateAppearance(v: Record<string, unknown>, path: string): Appearance {
  const a: Appearance = {};
  const label = str(v.label, `${path}.label`, { max: LIMITS.maxLabel, optional: true });
  const icon = str(v.icon, `${path}.icon`, { max: LIMITS.maxIcon, optional: true });
  const image = str(v.image, `${path}.image`, { max: LIMITS.maxImage, optional: true });
  const color = str(v.color, `${path}.color`, { max: 20, optional: true });
  const textColor = str(v.textColor, `${path}.textColor`, { max: 20, optional: true });
  if (image && !IMAGE_RE.test(image)) fail(`${path}.image`, "must be a base64 image data URL");
  if (color && !COLOR_RE.test(color)) fail(`${path}.color`, "must be a hex or named color");
  if (textColor && !COLOR_RE.test(textColor)) fail(`${path}.textColor`, "must be a hex or named color");
  if (label) a.label = label;
  if (icon) a.icon = icon;
  if (image) a.image = image;
  if (color) a.color = color;
  if (textColor) a.textColor = textColor;
  return a;
}

function validateButton(v: unknown, path: string, ids: Set<string>): ButtonConfig | null {
  if (v === null || v === undefined) return null;
  if (!isObj(v)) return fail(path, "must be an object or null");
  const id = str(v.id, `${path}.id`, { max: 64, nonEmpty: true })!;
  if (ids.has(id)) fail(`${path}.id`, `duplicate id "${id}"`);
  ids.add(id);

  const b: ButtonConfig = { id, ...validateAppearance(v, path), action: validateAction(v.action, `${path}.action`) };
  if (v.onState !== undefined && v.onState !== null) {
    if (!isObj(v.onState)) fail(`${path}.onState`, "must be an object");
    const os = v.onState as Record<string, unknown>;
    const onState: OnState = validateAppearance(os, `${path}.onState`);
    if (os.action !== undefined && os.action !== null) onState.action = validateAction(os.action, `${path}.onState.action`);
    b.onState = onState;
  }
  return b;
}

/** Every action in a button, including on-state actions and multi-action steps. */
export function* actionsOf(b: ButtonConfig): Generator<ActionConfig | StepConfig> {
  for (const a of [b.action, b.onState?.action]) {
    if (!a) continue;
    yield a;
    if (a.type === "multi") yield* a.steps;
  }
}

export function validateProfile(v: unknown): ProfileConfig {
  if (!isObj(v)) return fail("profile", "must be an object");
  const cols = int(v.cols, "cols", LIMITS.minCols, LIMITS.maxCols);
  const rows = int(v.rows, "rows", LIMITS.minRows, LIMITS.maxRows);
  if (!Array.isArray(v.pages) || v.pages.length === 0 || v.pages.length > LIMITS.maxPages)
    fail("pages", `must have 1-${LIMITS.maxPages} pages`);
  const rawFolders = v.folders ?? [];
  if (!Array.isArray(rawFolders) || rawFolders.length > LIMITS.maxFolders)
    fail("folders", `must be a list of at most ${LIMITS.maxFolders} folders`);

  const slots = cols * rows;
  const buttonIds = new Set<string>();
  const viewIds = new Set<string>();
  const validatePage = (p: unknown, path: string): PageConfig => {
    if (!isObj(p)) return fail(path, "must be an object");
    const id = str(p.id, `${path}.id`, { max: 64, nonEmpty: true })!;
    if (viewIds.has(id)) fail(`${path}.id`, `duplicate id "${id}"`);
    viewIds.add(id);
    if (!Array.isArray(p.buttons) || p.buttons.length > slots) fail(`${path}.buttons`, `must be a list of at most ${slots} slots`);
    const buttons = Array.from({ length: slots }, (_, i) =>
      validateButton((p.buttons as unknown[])[i], `${path}.buttons[${i}]`, buttonIds)
    );
    return { id, name: str(p.name, `${path}.name`, { max: LIMITS.maxLabel, nonEmpty: true })!, buttons };
  };

  const pages = (v.pages as unknown[]).map((p, i) => validatePage(p, `pages[${i}]`));
  const folders = (rawFolders as unknown[]).map((p, i) => validatePage(p, `folders[${i}]`));

  // Every folder action must point at an existing folder.
  const folderIds = new Set(folders.map((f) => f.id));
  for (const [kind, list] of [["pages", pages], ["folders", folders]] as const) {
    list.forEach((pg, pi) =>
      pg.buttons.forEach((b, bi) => {
        if (!b) return;
        for (const a of actionsOf(b)) {
          if (a.type === "folder" && !folderIds.has(a.folderId))
            fail(`${kind}[${pi}].buttons[${bi}]`, `opens a folder that doesn't exist ("${a.folderId}")`);
        }
      })
    );
  }

  const profile: ProfileConfig = {
    id: str(v.id, "id", { max: 64, nonEmpty: true })!,
    name: str(v.name, "name", { max: LIMITS.maxLabel, nonEmpty: true })!,
    cols,
    rows,
    pages,
  };
  if (folders.length) profile.folders = folders;
  return profile;
}

export function validateSettingsUpdate(v: unknown): SettingsUpdate {
  if (!isObj(v) || !isObj(v.obs)) return fail("settings", "must contain obs settings");
  const o = v.obs;
  if (typeof o.enabled !== "boolean") fail("obs.enabled", "must be true or false");
  const host = str(o.host, "obs.host", { max: 253, nonEmpty: true })!.trim();
  if (!/^[a-zA-Z0-9.\-:[\]]+$/.test(host)) fail("obs.host", "must be a hostname or IP address");
  const update: SettingsUpdate = { obs: { enabled: o.enabled as boolean, host, port: int(o.port, "obs.port", 1, 65535) } };
  if (o.password !== undefined) update.obs.password = str(o.password, "obs.password", { max: 200 }) ?? "";
  return update;
}
