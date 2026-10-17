import { useRoomStore } from "../state/room";
import { useUiStore } from "../state/ui";

const RECONNECT_DELAYS_MS = [2000, 5000, 10000, 15000, 30000];
const STALL_TIMEOUT_MS = 8000;

export class AudioEngine {
  private el: HTMLAudioElement | null = null;
  private counter = 0;
  private retryIdx = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTime = -1;
  private lastProgressAt = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  private createElement(): HTMLAudioElement {
    const el = new Audio();
    el.preload = "none";
    const ui = useUiStore.getState();
    el.volume = ui.muted ? 0 : ui.volume;
    el.addEventListener("error", () => this.onInterrupted("error"));
    el.addEventListener("ended", () => this.onInterrupted("ended"));
    el.addEventListener("playing", () => {
      this.retryIdx = 0;
      this.lastProgressAt = Date.now();
      this.lastTime = el.currentTime;
    });
    el.addEventListener("timeupdate", () => {
      this.lastTime = el.currentTime;
      this.lastProgressAt = Date.now();
      this.retryIdx = 0;
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      if (el.paused && useRoomStore.getState().joined) void el.play().catch(() => undefined);
    });
    return el;
  }

  private onInterrupted(reason: string): void {
    if (!useRoomStore.getState().joined) return;
    console.warn("[stream] interrupted:", reason);
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.retryTimer) return;
    const delay = RECONNECT_DELAYS_MS[Math.min(this.retryIdx, RECONNECT_DELAYS_MS.length - 1)] ?? 30000;
    this.retryIdx += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.reconnect();
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private attachSrc(): void {
    const el = this.el;
    if (!el) return;
    this.counter += 1;
    el.src = `/stream?c=${this.counter}`;
  }

  private async reconnect(): Promise<void> {
    if (!useRoomStore.getState().joined) return;
    const el = this.el;
    if (!el) return;
    this.attachSrc();
    try {
      await el.play();
    } catch {
      this.scheduleReconnect();
    }
  }

  async join(): Promise<void> {
    if (!this.el) {
      this.el = this.createElement();
      this.startWatchdog();
    }
    this.cancelReconnect();
    this.attachSrc();
    await this.el.play();
    useRoomStore.getState().setJoined(true);
  }

  leave(): void {
    this.cancelReconnect();
    const el = this.el;
    useRoomStore.getState().setJoined(false);
    if (!el) return;
    el.pause();
    el.removeAttribute("src");
    el.load();
  }

  pause(): void {
    this.cancelReconnect();
    if (this.el && !this.el.paused) {
      this.el.pause();
    }
  }

  async resume(): Promise<void> {
    if (!useRoomStore.getState().joined) return this.join();
    if (!this.el) return this.join();
    try {
      await this.el.play();
    } catch {
      this.resync();
    }
  }

  isPlaying(): boolean {
    return this.el ? !this.el.paused : false;
  }

  stopAndFlush(): void {
    this.cancelReconnect();
    const el = this.el;
    if (!el) return;
    el.pause();
    el.removeAttribute("src");
    el.load();
  }

  resync(): void {
    if (!this.el || !useRoomStore.getState().joined) return;
    this.cancelReconnect();
    this.attachSrc();
    void this.el.play().catch(() => undefined);
  }

  applyVolume(volume: number, muted: boolean): void {
    if (this.el) this.el.volume = muted ? 0 : volume;
  }

  private startWatchdog(): void {
    if (this.watchdog) return;
    this.watchdog = setInterval(() => {
      const el = this.el;
      if (
        !el ||
        !useRoomStore.getState().joined ||
        el.paused ||
        useRoomStore.getState().state?.status === "paused"
      ) {
        return;
      }
      if (Date.now() - this.lastProgressAt > STALL_TIMEOUT_MS && el.currentTime === this.lastTime) {
        console.warn("[stream] stalled >8s — reconnecting");
        el.pause();
        this.scheduleReconnect();
      }
    }, 2000);
  }
}

export const audioEngine = new AudioEngine();
