// Deck state: navigation (pages + folder stack), button on/off state, press handling.

import { DeskThing } from "@deskthing/server";
import {
  hasLiveState,
  type ActionConfig,
  type Appearance,
  type AudioDevice,
  type ButtonConfig,
  type ButtonView,
  type DeckView,
  type PageConfig,
  type ProfileConfig,
  type ServerToClient,
  type StepConfig,
} from "../shared/types";
import { runAction } from "./actions";
import { audioState } from "./audioState";
import { obs } from "./obs";
import { getProfile, setProfile } from "./store";

let pageIndex = 0;
/** Open folders, innermost last. */
let folderStack: string[] = [];
/** On/off state of manual toggle buttons (reset when the app restarts). */
const toggles = new Map<string, boolean>();

const profile = () => getProfile();

function send(msg: ServerToClient) {
  DeskThing.send(msg);
}

// ---- live state wiring ------------------------------------------------------

let viewTimer: NodeJS.Timeout | null = null;
/** Coalesce bursts of state changes (e.g. OBS events) into one view update. */
function scheduleView() {
  if (viewTimer) return;
  viewTimer = setTimeout(() => {
    viewTimer = null;
    sendView();
  }, 50);
}
obs.on("change", scheduleView);
audioState.on("change", scheduleView);

/** Tell the live-state sources what the current profile displays. */
function updateWatches(p: ProfileConfig) {
  const inputs = new Set<string>();
  const devices = new Set<AudioDevice>();
  for (const page of [...p.pages, ...(p.folders ?? [])]) {
    for (const b of page.buttons) {
      if (b?.action.type === "obs" && b.action.op === "mute") inputs.add(b.action.input);
      if (b?.action.type === "audio") devices.add(b.action.device);
    }
  }
  obs.watchInputs(inputs);
  audioState.watch(devices);
}

export function initDeck() {
  pageIndex = 0;
  folderStack = [];
  updateWatches(profile());
}

export function stopDeck() {
  audioState.stop();
  if (viewTimer) clearTimeout(viewTimer);
  viewTimer = null;
}

export function saveProfile(next: ProfileConfig) {
  setProfile(next);
  pageIndex = Math.min(pageIndex, next.pages.length - 1);
  const folderIds = new Set((next.folders ?? []).map((f) => f.id));
  folderStack = folderStack.filter((id) => folderIds.has(id));
  updateWatches(next);
  sendView();
}

// ---- view -------------------------------------------------------------------

function currentPage(): { page: PageConfig; inFolder: boolean } {
  const p = profile();
  const folderId = folderStack[folderStack.length - 1];
  const folder = folderId ? p.folders?.find((f) => f.id === folderId) : undefined;
  if (folder) return { page: folder, inFolder: true };
  return { page: p.pages[Math.min(pageIndex, p.pages.length - 1)], inFolder: false };
}

function isOn(b: ButtonConfig): boolean {
  const a = b.action;
  if (a.type === "obs") return obs.isActive(a);
  if (a.type === "audio") return audioState.isMuted(a.device);
  return !!b.onState && (toggles.get(b.id) ?? false);
}

const LOOK_KEYS: (keyof Appearance)[] = ["label", "icon", "image", "color", "textColor"];

function buttonView(b: ButtonConfig): ButtonView {
  const on = isOn(b);
  const view: ButtonView = { id: b.id, label: b.label, icon: b.icon, image: b.image, color: b.color, textColor: b.textColor };
  const overrides = b.onState ? LOOK_KEYS.filter((k) => b.onState![k] !== undefined) : [];
  if (on && overrides.length) {
    for (const k of overrides) view[k] = b.onState![k];
    // An image in the on-state replaces the emoji and vice versa.
    if (b.onState!.icon !== undefined && b.onState!.image === undefined) view.image = undefined;
  }
  if (on && !overrides.length) view.indicator = true;
  return view;
}

export function getView(): DeckView {
  const p = profile();
  const { page, inFolder } = currentPage();
  const slots = p.cols * p.rows;
  return {
    profileName: p.name,
    cols: p.cols,
    rows: p.rows,
    pageIndex,
    pageCount: p.pages.length,
    pageName: page.name,
    inFolder,
    buttons: Array.from({ length: slots }, (_, i) => {
      const b = page.buttons[i];
      return b ? buttonView(b) : null;
    }),
  };
}

export function sendView() {
  send({ type: "view", payload: getView() });
}

// ---- navigation -----------------------------------------------------------------

export function goToPage(index: number) {
  const count = profile().pages.length;
  pageIndex = ((index % count) + count) % count;
  folderStack = [];
  sendView();
}

/** Dial: leaves an open folder first, otherwise flips pages. */
export function changePage(delta: number) {
  if (folderStack.length) {
    folderStack = [];
    sendView();
  } else {
    goToPage(pageIndex + delta);
  }
}

// ---- actions ----------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function execute(action: ActionConfig | StepConfig): Promise<void> {
  switch (action.type) {
    case "page":
      if (action.target === "next") changePage(1);
      else if (action.target === "previous") changePage(-1);
      else goToPage(action.target);
      return;
    case "folder":
      if (!profile().folders?.some((f) => f.id === action.folderId)) throw new Error("That folder no longer exists");
      folderStack.push(action.folderId);
      sendView();
      return;
    case "back":
      folderStack.pop();
      sendView();
      return;
    case "delay":
      await sleep(action.ms);
      return;
    case "multi":
      for (let i = 0; i < action.steps.length; i++) {
        try {
          await execute(action.steps[i]);
        } catch (e) {
          throw new Error(`Step ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return;
    case "obs":
      await obs.run(action);
      return;
    case "audio":
      await audioState.run(action.device, action.op);
      return;
    default:
      await runAction(action);
  }
}

/** Run an action from the configurator's "Test" button. */
export const testAction = execute;

function findButton(buttonId: string): ButtonConfig | undefined {
  return currentPage().page.buttons.find((b): b is ButtonConfig => !!b && b.id === buttonId);
}

export async function press(buttonId: string) {
  const button = findButton(buttonId);
  if (!button) {
    // Client is probably showing a stale page; resync it.
    sendView();
    return;
  }
  try {
    const manualToggle = !!button.onState && !hasLiveState(button.action);
    if (manualToggle) {
      const on = toggles.get(button.id) ?? false;
      await execute(on ? button.onState!.action ?? button.action : button.action);
      toggles.set(button.id, !on);
      sendView();
    } else {
      await execute(button.action);
    }
    send({ type: "pressResult", payload: { buttonId, ok: true } });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`Action for button "${buttonId}" failed:`, error);
    send({ type: "pressResult", payload: { buttonId, ok: false, error } });
  }
}
