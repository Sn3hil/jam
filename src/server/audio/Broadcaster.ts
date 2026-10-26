import type { FrameSource } from "./TrackEncoder";
import { FRAME_MS } from "./mp3Framer";
import type { Mp3Frame } from "./mp3Framer";

export const LEAD_FRAMES = 20;
const LEAD_MS = LEAD_FRAMES * FRAME_MS;
const RING_CAPACITY = LEAD_FRAMES + 10;
const DROP_BACKPRESSURE_BYTES = -65536;

export interface BroadcasterClient {
  readonly id: number;
  readonly userId: number;
  readonly controller: ReadableStreamDefaultController<Uint8Array>;
  startedAtMs: number;
}

export interface BroadcasterClientParams {
  readonly id: number;
  readonly userId: number;
}

export interface BroadcasterDeps {
  silenceFrames: Mp3Frame[];
  clock: () => number;
  intervalMs?: number;
}

export type BroadcasterEvent =
  | { type: "track_ended" }
  | { type: "track_switched" }
  | { type: "error"; message: string };

export class Broadcaster {
  readonly clients = new Map<number, BroadcasterClient>();
  private source: FrameSource | null = null;
  private nextSource: FrameSource | null = null;
  private readonly clock: () => number;
  private readonly intervalMs: number;
  private readonly silenceFrames: Mp3Frame[];
  private silenceIndex = 0;
  private ring: Mp3Frame[] = [];
  private ringCursor = 0;
  private anchor = 0;
  private emitted = 0;
  private trackFramesEmitted = 0;
  private paused = true;
  private timer: ReturnType<typeof setInterval> | null = null;
  onEvent: ((event: BroadcasterEvent) => void) | null = null;
  private trackEndedReported = false;

  constructor(deps: BroadcasterDeps) {
    this.silenceFrames = deps.silenceFrames;
    this.clock = deps.clock;
    this.intervalMs = deps.intervalMs ?? 40;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get emittedFrames(): number {
    return this.emitted;
  }

  get positionMs(): number {
    return Math.max(0, this.trackFramesEmitted * FRAME_MS - LEAD_MS);
  }

  get hasSource(): boolean {
    return this.source !== null;
  }

  start(paused: boolean): void {
    this.setPaused(paused);
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    if (paused) {
      if (this.timer !== null) {
        clearInterval(this.timer);
        this.timer = null;
      }
      this.ring = [];
      this.ringCursor = 0;
      return;
    }
    this.anchor = this.clock();
    // Only burst LEAD_FRAMES if the ring buffer is empty; otherwise pace at 1x real-time
    this.emitted = this.ring.length > 0 ? LEAD_FRAMES : 0;
    this.trackEndedReported = false;
    this.timer = setInterval(() => {
      try {
        this.tick();
      } catch (error) {
        this.onEvent?.({ type: "error", message: String(error) });
      }
    }, this.intervalMs);
  }

  setTrack(source: FrameSource | null): void {
    if (this.source === source && source !== null) return;
    this.source = source;
    this.nextSource = null;
    this.trackFramesEmitted = 0;
    this.trackEndedReported = false;
    this.ring = [];
    this.ringCursor = 0;
  }

  setNextSource(source: FrameSource | null): void {
    this.nextSource = source;
  }

  addClient(
    client: BroadcasterClientParams,
    controller: ReadableStreamDefaultController<Uint8Array>,
  ): BroadcasterClient {
    const full: BroadcasterClient = { ...client, controller, startedAtMs: this.clock() };
    this.clients.set(full.id, full);
    // Only send intro burst if actively playing a track
    if (!this.paused && this.source !== null) {
      const intro = this.concatFrames(this.ringInOrder());
      if (intro.length > 0) {
        try {
          full.controller.enqueue(intro);
        } catch {
          this.clients.delete(full.id);
        }
      }
    }
    return full;
  }

  removeClient(id: number): void {
    this.clients.delete(id);
  }

  get clientCount(): number {
    return this.clients.size;
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.ring = [];
    this.ringCursor = 0;
    this.clients.clear();
  }

  tick(): void {
    if (this.paused) return;
    const now = this.clock();
    const target = Math.floor((now - this.anchor) / FRAME_MS) + LEAD_FRAMES;
    const out: Mp3Frame[] = [];
    let endedNow = false;
    while (this.emitted < target) {
      let frame: Mp3Frame | null = null;
      if (this.source) {
        const taken = this.source.take(1);
        if (taken.length > 0) {
          frame = taken[0]!;
          this.trackFramesEmitted += 1;
        } else if (this.source.finished) {
          if (this.nextSource) {
            const prevSource = this.source;
            this.source = this.nextSource;
            this.nextSource = null;
            this.trackFramesEmitted = 0;
            this.ring = [];
            this.ringCursor = 0;
            prevSource.kill();
            this.onEvent?.({ type: "track_switched" });
            const taken2 = this.source.take(1);
            if (taken2.length > 0) {
              frame = taken2[0]!;
              this.trackFramesEmitted += 1;
            }
          } else {
            const prevSource = this.source;
            this.source = null;
            this.trackFramesEmitted = 0;
            this.ring = [];
            this.ringCursor = 0;
            prevSource.kill();
            endedNow = true;
          }
        }
      }
      if (!frame && this.source === null) {
        frame = this.nextSilenceFrame();
      }
      if (!frame) break;
      out.push(frame);
      this.emitted += 1;
    }
    if (out.length > 0) {
      const payload = this.concatFrames(out);
      if (this.source !== null) {
        this.appendRing(out);
      }
      for (const [id, client] of this.clients) {
        try {
          client.controller.enqueue(payload);
          if (
            client.controller.desiredSize !== null &&
            client.controller.desiredSize < DROP_BACKPRESSURE_BYTES
          ) {
            throw new Error("backpressure");
          }
        } catch {
          this.clients.delete(id);
        }
      }
    }
    if (endedNow && !this.trackEndedReported) {
      this.trackEndedReported = true;
      this.onEvent?.({ type: "track_ended" });
    }
  }

  private nextSilenceFrame(): Mp3Frame {
    if (this.silenceFrames.length === 0) {
      return { bytes: new Uint8Array(417), hasPadding: false };
    }
    const frame = this.silenceFrames[this.silenceIndex % this.silenceFrames.length]!;
    this.silenceIndex += 1;
    return frame;
  }

  private appendRing(frames: Mp3Frame[]): void {
    for (const frame of frames) {
      if (this.ring.length < RING_CAPACITY) {
        this.ring.push(frame);
      } else {
        this.ring[this.ringCursor] = frame;
        this.ringCursor = (this.ringCursor + 1) % RING_CAPACITY;
      }
    }
  }

  private ringInOrder(): Mp3Frame[] {
    if (this.ring.length < RING_CAPACITY) return this.ring;
    const head = this.ring.slice(this.ringCursor);
    const tail = this.ring.slice(0, this.ringCursor);
    return [...head, ...tail];
  }

  private concatFrames(frames: Mp3Frame[]): Uint8Array {
    let total = 0;
    for (const frame of frames) total += frame.bytes.byteLength;
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const frame of frames) {
      merged.set(frame.bytes, offset);
      offset += frame.bytes.byteLength;
    }
    return merged;
  }
}
