// Persistence for the profile and app settings (DeskThing app data).
// Both are always written together so we don't depend on saveData merge semantics.

import { DeskThing } from "@deskthing/server";
import { DEFAULT_SETTINGS, type AppSettingsData, type ProfileConfig, type PublicSettings, type SettingsUpdate } from "../shared/types";
import { validateProfile } from "../shared/validate";
import { defaultProfile } from "./defaultProfile";

let profile: ProfileConfig = defaultProfile;
let settings: AppSettingsData = structuredClone(DEFAULT_SETTINGS);

export async function loadStore() {
  let data: Record<string, unknown> | null = null;
  try {
    data = await DeskThing.getData();
  } catch (e) {
    console.error("Could not read saved data:", e);
  }
  try {
    profile = data?.profile ? validateProfile(data.profile) : defaultProfile;
  } catch (e) {
    console.error("Saved profile is invalid, using default:", e);
    profile = defaultProfile;
  }
  const saved = (data?.settings ?? {}) as Partial<AppSettingsData>;
  settings = { obs: { ...DEFAULT_SETTINGS.obs, ...(saved.obs ?? {}) } };
}

const persist = () => DeskThing.saveData({ profile, settings });

export const getProfile = () => profile;
export const getSettings = () => settings;

export function setProfile(next: ProfileConfig) {
  profile = next;
  persist();
}

export function updateSettings(update: SettingsUpdate) {
  settings = {
    obs: { ...update.obs, password: update.obs.password ?? settings.obs.password },
  };
  persist();
  return settings;
}

export const publicSettings = (): PublicSettings => {
  const { password, ...obs } = settings.obs;
  return { obs: { ...obs, hasPassword: password.length > 0 } };
};
