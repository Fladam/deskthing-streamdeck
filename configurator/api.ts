import type { ActionConfig, ObsStatus, ProfileConfig, PublicSettings, SettingsUpdate } from "../shared/types";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json", "X-StreamDeck-Config": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  getProfile: () => request<ProfileConfig>("GET", "/api/profile"),
  saveProfile: (p: ProfileConfig) => request<ProfileConfig>("PUT", "/api/profile", p),
  testAction: (action: ActionConfig) => request<{ ok: true }>("POST", "/api/test", { action }),
  getSettings: () => request<PublicSettings>("GET", "/api/settings"),
  saveSettings: (s: SettingsUpdate) => request<PublicSettings>("PUT", "/api/settings", s),
  obsStatus: () => request<ObsStatus>("GET", "/api/obs/status"),
};
