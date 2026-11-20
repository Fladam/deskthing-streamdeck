// Key names (case-insensitive) -> Windows virtual-key codes, shared by the
// server (to send input) and the configurator (to validate / record hotkeys).
import type { MediaKey } from "./types";

const VK: Record<string, number> = {
  CTRL: 0x11, CONTROL: 0x11, LCTRL: 0xa2, RCTRL: 0xa3,
  SHIFT: 0x10, LSHIFT: 0xa0, RSHIFT: 0xa1,
  ALT: 0x12, LALT: 0xa4, RALT: 0xa5,
  WIN: 0x5b, META: 0x5b, LWIN: 0x5b, RWIN: 0x5c,
  ENTER: 0x0d, RETURN: 0x0d, ESC: 0x1b, ESCAPE: 0x1b, TAB: 0x09, SPACE: 0x20,
  BACKSPACE: 0x08, DELETE: 0x2e, DEL: 0x2e, INSERT: 0x2d, INS: 0x2d,
  HOME: 0x24, END: 0x23, PAGEUP: 0x21, PGUP: 0x21, PAGEDOWN: 0x22, PGDN: 0x22,
  LEFT: 0x25, UP: 0x26, RIGHT: 0x27, DOWN: 0x28,
  PRINTSCREEN: 0x2c, PRTSC: 0x2c, PAUSE: 0x13, CAPSLOCK: 0x14, NUMLOCK: 0x90, SCROLLLOCK: 0x91,
  APPS: 0x5d, MENU: 0x5d,
  ";": 0xba, SEMICOLON: 0xba, "=": 0xbb, EQUALS: 0xbb, ",": 0xbc, COMMA: 0xbc,
  "-": 0xbd, MINUS: 0xbd, ".": 0xbe, PERIOD: 0xbe, "/": 0xbf, SLASH: 0xbf,
  "`": 0xc0, BACKQUOTE: 0xc0, "[": 0xdb, "\\": 0xdc, BACKSLASH: 0xdc, "]": 0xdd, "'": 0xde, QUOTE: 0xde,
  NUMPADMULTIPLY: 0x6a, NUMPADADD: 0x6b, NUMPADSUBTRACT: 0x6d, NUMPADDECIMAL: 0x6e, NUMPADDIVIDE: 0x6f,
  VOLUMEMUTE: 0xad, VOLUMEDOWN: 0xae, VOLUMEUP: 0xaf,
  MEDIANEXT: 0xb0, MEDIAPREV: 0xb1, MEDIASTOP: 0xb2, MEDIAPLAYPAUSE: 0xb3,
};

for (let i = 0; i < 26; i++) VK[String.fromCharCode(65 + i)] = 0x41 + i; // A-Z
for (let i = 0; i <= 9; i++) {
  VK[String(i)] = 0x30 + i; // 0-9
  VK[`NUMPAD${i}`] = 0x60 + i;
}
for (let i = 1; i <= 24; i++) VK[`F${i}`] = 0x6f + i; // F1-F24

export function isValidKeyName(name: string): boolean {
  return VK[name.trim().toUpperCase()] !== undefined;
}

export function keyNameToVk(name: string): number {
  const vk = VK[name.trim().toUpperCase()];
  if (vk === undefined) throw new Error(`Unknown key "${name}"`);
  return vk;
}

export const MEDIA_VK: Record<MediaKey, number> = {
  playpause: 0xb3,
  next: 0xb0,
  previous: 0xb1,
  stop: 0xb2,
  volumeup: 0xaf,
  volumedown: 0xae,
  mute: 0xad,
};

const MODIFIER_ORDER = ["CTRL", "WIN", "ALT", "SHIFT"];
export const isModifier = (k: string) => MODIFIER_ORDER.includes(k);

const CODE_NAMES: Record<string, string> = {
  ControlLeft: "CTRL", ControlRight: "CTRL", ShiftLeft: "SHIFT", ShiftRight: "SHIFT",
  AltLeft: "ALT", AltRight: "ALT", MetaLeft: "WIN", MetaRight: "WIN", OSLeft: "WIN", OSRight: "WIN",
  Enter: "ENTER", NumpadEnter: "ENTER", Escape: "ESC", Tab: "TAB", Space: "SPACE", Backspace: "BACKSPACE",
  Delete: "DELETE", Insert: "INSERT", Home: "HOME", End: "END", PageUp: "PAGEUP", PageDown: "PAGEDOWN",
  ArrowLeft: "LEFT", ArrowUp: "UP", ArrowRight: "RIGHT", ArrowDown: "DOWN",
  PrintScreen: "PRINTSCREEN", Pause: "PAUSE", CapsLock: "CAPSLOCK", NumLock: "NUMLOCK", ScrollLock: "SCROLLLOCK",
  ContextMenu: "APPS", Semicolon: ";", Equal: "=", Comma: ",", Minus: "-", Period: ".", Slash: "/",
  Backquote: "`", BracketLeft: "[", Backslash: "\\", BracketRight: "]", Quote: "'",
  NumpadMultiply: "NUMPADMULTIPLY", NumpadAdd: "NUMPADADD", NumpadSubtract: "NUMPADSUBTRACT",
  NumpadDecimal: "NUMPADDECIMAL", NumpadDivide: "NUMPADDIVIDE",
  AudioVolumeMute: "VOLUMEMUTE", AudioVolumeDown: "VOLUMEDOWN", AudioVolumeUp: "VOLUMEUP",
  MediaTrackNext: "MEDIANEXT", MediaTrackPrevious: "MEDIAPREV", MediaStop: "MEDIASTOP", MediaPlayPause: "MEDIAPLAYPAUSE",
};

/** Map a browser KeyboardEvent.code to one of our key names (or null if unsupported). */
export function codeToKeyName(code: string): string | null {
  if (CODE_NAMES[code]) return CODE_NAMES[code];
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  m = /^Digit(\d)$/.exec(code);
  if (m) return m[1];
  m = /^Numpad(\d)$/.exec(code);
  if (m) return `NUMPAD${m[1]}`;
  m = /^F(\d{1,2})$/.exec(code);
  if (m && Number(m[1]) <= 24) return code;
  return null;
}

/** Sort a combo so modifiers come first in a conventional order. */
export function normalizeCombo(keys: string[]): string[] {
  const upper = [...new Set(keys.map((k) => k.trim().toUpperCase()).filter(Boolean))];
  const mods = MODIFIER_ORDER.filter((m) => upper.includes(m));
  return [...mods, ...upper.filter((k) => !isModifier(k))];
}
