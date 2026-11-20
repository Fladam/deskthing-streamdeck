// Live mute state of the default mic / speakers, polled while buttons need it.

import { EventEmitter } from "node:events";
import type { AudioDevice, AudioOp } from "../shared/types";
import { inputHelper } from "./win/input";

const POLL_MS = 1500;

class AudioState extends EventEmitter {
  private muted = new Map<AudioDevice, boolean>();
  private watched = new Set<AudioDevice>();
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  isMuted(d: AudioDevice) {
    return this.muted.get(d) ?? false;
  }

  /** Poll only the devices some button displays. */
  watch(devices: Iterable<AudioDevice>) {
    this.watched = new Set(devices);
    if (this.watched.size && !this.timer) {
      this.timer = setInterval(() => void this.poll(), POLL_MS);
      void this.poll();
    } else if (!this.watched.size) {
      this.stop();
    }
  }

  async run(device: AudioDevice, op: AudioOp) {
    this.set(device, await inputHelper.audio(device, op));
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private set(d: AudioDevice, value: boolean) {
    if (this.muted.get(d) !== value) {
      this.muted.set(d, value);
      this.emit("change");
    }
  }

  private async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      for (const d of this.watched) this.set(d, await inputHelper.audio(d, "get"));
    } catch (e) {
      console.error("[audio] poll failed:", e instanceof Error ? e.message : e);
    } finally {
      this.polling = false;
    }
  }
}

export const audioState = new AudioState();
