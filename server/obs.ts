// Minimal obs-websocket v5 client (OBS 28+ has the server built in: Tools → WebSocket Server Settings).
// Keeps a live mirror of the state our buttons care about and reconnects automatically.

import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import WebSocket from "ws";
import type { ObsAction, ObsSettings, ObsStatus } from "../shared/types";

const RECONNECT_MS = 5000;
const REQUEST_TIMEOUT_MS = 5000;

const OP = { Hello: 0, Identify: 1, Identified: 2, Event: 5, Request: 6, RequestResponse: 7 } as const;

type Pending = { resolve: (data: Record<string, unknown>) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };

const sha256b64 = (s: string) => crypto.createHash("sha256").update(s).digest("base64");

export class ObsClient extends EventEmitter {
  private settings: ObsSettings | null = null;
  private ws: WebSocket | null = null;
  private identified = false;
  private error: string | undefined;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pending = new Map<string, Pending>();
  private nextId = 1;
  private watchedInputs = new Set<string>();

  // Live state
  private recording = false;
  private streaming = false;
  private virtualcam = false;
  private scene: string | null = null;
  private mutes = new Map<string, boolean>();
  private scenes: string[] = [];
  private inputs: string[] = [];

  /** Apply new connection settings (reconnects only if something changed). */
  configure(settings: ObsSettings) {
    const prev = this.settings;
    this.settings = { ...settings };
    const same =
      prev && prev.enabled === settings.enabled && prev.host === settings.host && prev.port === settings.port && prev.password === settings.password;
    if (same) return;
    this.disconnect();
    this.error = undefined;
    if (settings.enabled) this.connect();
    this.emit("change");
  }

  /** Inputs whose mute state buttons display (fetched on connect). */
  watchInputs(names: Iterable<string>) {
    const next = new Set(names);
    const added = [...next].filter((n) => !this.watchedInputs.has(n));
    this.watchedInputs = next;
    if (this.identified && added.length) void this.refreshMutes(added);
  }

  status(): ObsStatus {
    return {
      enabled: !!this.settings?.enabled,
      connected: this.identified,
      error: this.error,
      scenes: this.scenes,
      inputs: this.inputs,
    };
  }

  /** Live "on" state for a button with this action. */
  isActive(a: ObsAction): boolean {
    if (!this.identified) return false;
    switch (a.op) {
      case "record": return this.recording;
      case "stream": return this.streaming;
      case "virtualcam": return this.virtualcam;
      case "scene": return this.scene === a.scene;
      case "mute": return this.mutes.get(a.input) ?? false;
    }
  }

  async run(a: ObsAction): Promise<void> {
    switch (a.op) {
      case "scene": await this.request("SetCurrentProgramScene", { sceneName: a.scene }); break;
      case "record": await this.request("ToggleRecord"); break;
      case "stream": await this.request("ToggleStream"); break;
      case "virtualcam": await this.request("ToggleVirtualCam"); break;
      case "mute": await this.request("ToggleInputMute", { inputName: a.input }); break;
    }
  }

  stop() {
    this.settings = null;
    this.disconnect();
  }

  // ---- connection -----------------------------------------------------------

  private connect() {
    const s = this.settings;
    if (!s?.enabled) return;
    const url = `ws://${s.host.includes(":") && !s.host.startsWith("[") ? `[${s.host}]` : s.host}:${s.port}`;
    const ws = new WebSocket(url, "obswebsocket.json", { handshakeTimeout: 5000 });
    this.ws = ws;

    ws.on("message", (raw) => {
      let msg: { op: number; d: Record<string, any> };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      this.onMessage(ws, msg.op, msg.d ?? {});
    });
    ws.on("error", (err: NodeJS.ErrnoException) => {
      this.setError(
        err.code === "ECONNREFUSED"
          ? `Can't reach OBS at ${s.host}:${s.port}. Is OBS running with the WebSocket server enabled?`
          : `OBS connection error: ${err.message}`
      );
    });
    ws.on("close", (code, reason) => {
      if (this.ws !== ws) return; // superseded by a newer connection
      const wasIdentified = this.identified;
      this.identified = false;
      this.ws = null;
      this.failPending(new Error("OBS disconnected"));
      if (code === 4009) this.setError("OBS rejected the password");
      else if (code >= 4000) this.setError(`OBS closed the connection: ${reason.toString() || code}`);
      else if (wasIdentified) this.setError("OBS disconnected");
      if (wasIdentified) {
        console.log("[obs] disconnected");
        this.emit("change");
      }
      this.scheduleReconnect();
    });
  }

  private onMessage(ws: WebSocket, op: number, d: Record<string, any>) {
    switch (op) {
      case OP.Hello: {
        const identify: Record<string, unknown> = { rpcVersion: 1 };
        if (d.authentication) {
          if (!this.settings?.password) {
            this.setError("OBS requires a password. Enter it in the configurator settings.");
            ws.close();
            return;
          }
          const { challenge, salt } = d.authentication;
          identify.authentication = sha256b64(sha256b64(this.settings.password + salt) + challenge);
        }
        ws.send(JSON.stringify({ op: OP.Identify, d: identify }));
        break;
      }
      case OP.Identified:
        this.identified = true;
        this.error = undefined;
        console.log("[obs] connected");
        void this.refreshAll();
        break;
      case OP.RequestResponse: {
        const p = this.pending.get(d.requestId);
        if (!p) return;
        this.pending.delete(d.requestId);
        clearTimeout(p.timer);
        if (d.requestStatus?.result) p.resolve(d.responseData ?? {});
        else p.reject(new Error(`OBS: ${d.requestStatus?.comment ?? `request failed (code ${d.requestStatus?.code})`}`));
        break;
      }
      case OP.Event:
        this.onEvent(d.eventType, d.eventData ?? {});
        break;
    }
  }

  private onEvent(type: string, data: Record<string, any>) {
    switch (type) {
      case "RecordStateChanged": this.recording = !!data.outputActive; break;
      case "StreamStateChanged": this.streaming = !!data.outputActive; break;
      case "VirtualcamStateChanged": this.virtualcam = !!data.outputActive; break;
      case "CurrentProgramSceneChanged": this.scene = data.sceneName ?? null; break;
      case "InputMuteStateChanged": this.mutes.set(data.inputName, !!data.inputMuted); break;
      case "SceneListChanged":
      case "SceneNameChanged":
      case "InputCreated":
      case "InputRemoved":
      case "InputNameChanged":
        void this.refreshLists();
        return;
      default:
        return;
    }
    this.emit("change");
  }

  private async refreshAll() {
    try {
      const [rec, stream, vcam, scene] = await Promise.all([
        this.request("GetRecordStatus"),
        this.request("GetStreamStatus"),
        this.request("GetVirtualCamStatus").catch(() => ({ outputActive: false })),
        this.request("GetCurrentProgramScene"),
      ]);
      this.recording = !!rec.outputActive;
      this.streaming = !!stream.outputActive;
      this.virtualcam = !!vcam.outputActive;
      this.scene = ((scene.currentProgramSceneName ?? scene.sceneName) as string) ?? null;
      await this.refreshLists();
      await this.refreshMutes([...this.watchedInputs]);
    } catch (e) {
      console.error("[obs] refresh failed:", e instanceof Error ? e.message : e);
    }
    this.emit("change");
  }

  private async refreshLists() {
    try {
      const [sceneList, inputList] = await Promise.all([this.request("GetSceneList"), this.request("GetInputList")]);
      // OBS lists scenes bottom-to-top; show them in the order the OBS UI does.
      this.scenes = ((sceneList.scenes as { sceneName: string }[]) ?? []).map((s) => s.sceneName).reverse();
      this.inputs = ((inputList.inputs as { inputName: string }[]) ?? []).map((i) => i.inputName);
    } catch (e) {
      console.error("[obs] list refresh failed:", e instanceof Error ? e.message : e);
    }
    this.emit("change");
  }

  private async refreshMutes(names: string[]) {
    await Promise.all(
      names.map(async (inputName) => {
        try {
          const r = await this.request("GetInputMute", { inputName });
          this.mutes.set(inputName, !!r.inputMuted);
        } catch {
          // Input doesn't exist (or has no audio); treat as not muted.
          this.mutes.delete(inputName);
        }
      })
    );
    this.emit("change");
  }

  private request(requestType: string, requestData?: Record<string, unknown>): Promise<Record<string, any>> {
    const ws = this.ws;
    if (!ws || !this.identified) {
      return Promise.reject(new Error(this.settings?.enabled ? `OBS is not connected${this.error ? `: ${this.error}` : ""}` : "OBS integration is turned off (enable it in the configurator settings)"));
    }
    const requestId = String(this.nextId++);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`OBS did not answer ${requestType}`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, reject, timer });
      ws.send(JSON.stringify({ op: OP.Request, d: { requestType, requestId, requestData } }));
    });
  }

  private setError(msg: string) {
    if (this.error !== msg) {
      this.error = msg;
      console.warn("[obs]", msg);
      this.emit("change");
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || !this.settings?.enabled) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.ws) this.connect();
    }, RECONNECT_MS);
  }

  private failPending(err: Error) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  private disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const ws = this.ws;
    this.ws = null;
    this.identified = false;
    this.failPending(new Error("OBS connection closed"));
    if (ws) {
      ws.removeAllListeners();
      ws.on("error", () => {});
      ws.terminate();
    }
  }
}

export const obs = new ObsClient();
