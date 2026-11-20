// Strict validation for profiles coming from the configurator (or imported JSON).
// Returns a cleaned copy containing only known fields; throws ValidationError otherwise.

import { isValidKeyName } from "./keys";
import { LIMITS, type ActionConfig, type ButtonConfig, type MediaKey, type PageConfig, type ProfileConfig } from "./types";

export class ValidationError extends Error {}

const MEDIA_KEYS: MediaKey[] = ["playpause", "next", "previous", "stop", "volumeup", "volumedown", "mute"];
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
    default:
      return fail(`${path}.type`, `unknown action type "${String(v.type)}"`);
  }
}

function validateButton(v: unknown, path: string, ids: Set<string>): ButtonConfig | null {
  if (v === null || v === undefined) return null;
  if (!isObj(v)) return fail(path, "must be an object or null");
  const id = str(v.id, `${path}.id`, { max: 64, nonEmpty: true })!;
  if (ids.has(id)) fail(`${path}.id`, `duplicate id "${id}"`);
  ids.add(id);

  const b: ButtonConfig = { id, action: validateAction(v.action, `${path}.action`) };
  const label = str(v.label, `${path}.label`, { max: LIMITS.maxLabel, optional: true });
  const icon = str(v.icon, `${path}.icon`, { max: LIMITS.maxIcon, optional: true });
  const image = str(v.image, `${path}.image`, { max: LIMITS.maxImage, optional: true });
  const color = str(v.color, `${path}.color`, { max: 20, optional: true });
  const textColor = str(v.textColor, `${path}.textColor`, { max: 20, optional: true });
  if (image && !IMAGE_RE.test(image)) fail(`${path}.image`, "must be a base64 image data URL");
  if (color && !COLOR_RE.test(color)) fail(`${path}.color`, "must be a hex or named color");
  if (textColor && !COLOR_RE.test(textColor)) fail(`${path}.textColor`, "must be a hex or named color");
  if (label) b.label = label;
  if (icon) b.icon = icon;
  if (image) b.image = image;
  if (color) b.color = color;
  if (textColor) b.textColor = textColor;
  return b;
}

export function validateProfile(v: unknown): ProfileConfig {
  if (!isObj(v)) return fail("profile", "must be an object");
  const cols = int(v.cols, "cols", LIMITS.minCols, LIMITS.maxCols);
  const rows = int(v.rows, "rows", LIMITS.minRows, LIMITS.maxRows);
  if (!Array.isArray(v.pages) || v.pages.length === 0 || v.pages.length > LIMITS.maxPages)
    fail("pages", `must have 1-${LIMITS.maxPages} pages`);

  const slots = cols * rows;
  const buttonIds = new Set<string>();
  const pageIds = new Set<string>();
  const pages: PageConfig[] = (v.pages as unknown[]).map((p, pi) => {
    const path = `pages[${pi}]`;
    if (!isObj(p)) return fail(path, "must be an object");
    const id = str(p.id, `${path}.id`, { max: 64, nonEmpty: true })!;
    if (pageIds.has(id)) fail(`${path}.id`, `duplicate id "${id}"`);
    pageIds.add(id);
    if (!Array.isArray(p.buttons) || p.buttons.length > slots) fail(`${path}.buttons`, `must be a list of at most ${slots} slots`);
    const buttons = Array.from({ length: slots }, (_, i) =>
      validateButton((p.buttons as unknown[])[i], `${path}.buttons[${i}]`, buttonIds)
    );
    return { id, name: str(p.name, `${path}.name`, { max: LIMITS.maxLabel, nonEmpty: true })!, buttons };
  });

  return {
    id: str(v.id, "id", { max: 64, nonEmpty: true })!,
    name: str(v.name, "name", { max: LIMITS.maxLabel, nonEmpty: true })!,
    cols,
    rows,
    pages,
  };
}
