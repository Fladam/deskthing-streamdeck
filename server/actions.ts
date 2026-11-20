// Action engine: one executor per action type.
// "page" actions are handled by the deck itself (they change navigation state), see deck.ts.

import { spawn } from "child_process";
import type { ActionConfig, ActionType } from "../shared/types";
import { inputHelper } from "./win/input";
import { keyNameToVk, MEDIA_VK } from "../shared/keys";

/** Order-independent combo signature with key aliases collapsed (keys that share a VK code). */
const comboSignature = (keys: string[]) => [...new Set(keys.map(keyNameToVk))].sort((a, b) => a - b).join(",");
const LOCK_SIGNATURES = new Set([comboSignature(["WIN", "L"]), comboSignature(["RWIN", "L"])]);
const SAS_SIGNATURES = new Set(["CTRL", "LCTRL", "RCTRL"].flatMap((c) =>
  ["ALT", "LALT", "RALT"].map((a) => comboSignature([c, a, "DELETE"]))
));

type Executor<T extends ActionType> = (action: Extract<ActionConfig, { type: T }>) => Promise<void>;

/** Start a process fully detached from the DeskThing server and resolve once it has spawned. */
function detached(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: false });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

/** Open a URL (or any registered protocol) with the PC's default handler. */
export async function openUrl(url: string): Promise<void> {
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) throw new Error(`Not a URL: ${url}`);
  await detached("rundll32.exe", ["url.dll,FileProtocolHandler", url]);
}

const executors:{ [K in Exclude<ActionType, "page">]: Executor<K> } = {
  none: async () => {},

  hotkey: async ({ keys }) => {
    const sig = comboSignature(keys);
    // Windows handles these itself and ignores synthesized input for them.
    if (LOCK_SIGNATURES.has(sig)) return inputHelper.lockWorkstation();
    if (SAS_SIGNATURES.has(sig)) throw new Error("Windows doesn't let apps send Ctrl+Alt+Del");
    await inputHelper.sendKeys(keys.map(keyNameToVk));
  },

  media: async ({ key }) => {
    await inputHelper.sendKeys([MEDIA_VK[key]]);
  },

  text: async ({ text }) => {
    await inputHelper.typeText(text);
  },

  launch: async ({ path, args = [] }) => {
    if (/\.(exe|com)$/i.test(path)) {
      await detached(path, args);
    } else {
      // Files, folders, .lnk shortcuts, documents: open with the default handler.
      await detached("explorer.exe", [path]);
    }
  },

  url: async ({ url }) => openUrl(url),

  command: async ({ command, shell = "powershell" }) => {
    if (shell === "cmd") await detached("cmd.exe", ["/d", "/c", command]);
    else await detached("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command]);
  },
};

export async function runAction(action: ActionConfig): Promise<void> {
  if (action.type === "page") throw new Error("Page actions are handled by the deck");
  const exec = executors[action.type] as Executor<typeof action.type>;
  if (!exec) throw new Error(`Unknown action type "${(action as ActionConfig).type}"`);
  await exec(action as never);
}
