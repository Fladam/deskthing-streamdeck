// Deck state: the active profile, current page, and press handling.

import { DeskThing } from "@deskthing/server";
import type { ActionConfig, ButtonConfig, DeckView, ProfileConfig, ServerToClient } from "../shared/types";
import { validateProfile } from "../shared/validate";
import { runAction } from "./actions";
import { defaultProfile } from "./defaultProfile";

const STORAGE_KEY = "profile";

let profile: ProfileConfig = defaultProfile;
let pageIndex = 0;

function send(msg: ServerToClient) {
  DeskThing.send(msg);
}

export async function loadProfile() {
  try {
    const data = await DeskThing.getData();
    const saved = data?.[STORAGE_KEY];
    if (saved) profile = validateProfile(saved);
  } catch (e) {
    console.error("Saved profile is missing or invalid, using default:", e);
    profile = defaultProfile;
  }
  pageIndex = 0;
}

export const getProfile = () => profile;

export function saveProfile(next: ProfileConfig) {
  profile = next;
  pageIndex = Math.min(pageIndex, profile.pages.length - 1);
  DeskThing.saveData({ [STORAGE_KEY]: profile });
  sendView();
}

export function getView(): DeckView {
  const page = profile.pages[pageIndex];
  const slots = profile.cols * profile.rows;
  const buttons = Array.from({ length: slots }, (_, i) => {
    const b = page.buttons[i];
    return b
      ? { id: b.id, label: b.label, icon: b.icon, image: b.image, color: b.color, textColor: b.textColor }
      : null;
  });
  return {
    profileName: profile.name,
    cols: profile.cols,
    rows: profile.rows,
    pageIndex,
    pageCount: profile.pages.length,
    pageName: page.name,
    buttons,
  };
}

export function sendView() {
  send({ type: "view", payload: getView() });
}

export function goToPage(index: number) {
  const count = profile.pages.length;
  pageIndex = ((index % count) + count) % count;
  sendView();
}

export function changePage(delta: number) {
  goToPage(pageIndex + delta);
}

function findButton(buttonId: string): ButtonConfig | undefined {
  return profile.pages[pageIndex].buttons.find((b): b is ButtonConfig => !!b && b.id === buttonId);
}

async function execute(action: ActionConfig) {
  if (action.type === "page") {
    if (action.target === "next") changePage(1);
    else if (action.target === "previous") changePage(-1);
    else goToPage(action.target);
  } else {
    await runAction(action);
  }
}

/** Run an action from the configurator's "Test" button. */
export const testAction = execute;

export async function press(buttonId: string) {
  const button = findButton(buttonId);
  if (!button) {
    // Client is probably showing a stale page; resync it.
    sendView();
    return;
  }
  try {
    await execute(button.action);
    send({ type: "pressResult", payload: { buttonId, ok: true } });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`Action for button "${buttonId}" failed:`, error);
    send({ type: "pressResult", payload: { buttonId, ok: false, error } });
  }
}
