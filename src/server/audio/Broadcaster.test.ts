import { describe, expect, test } from "bun:test";
import { Broadcaster, type BroadcasterEvent } from "./Broadcaster";
import { FRAME_MS } from "./mp3Framer";
import type { Mp3Frame } from "./mp3Framer";
import type { FrameSource } from "./TrackEncoder";
import { makeSyntheticSilenceFrames } from "./silence";

function syntheticFrame(marker: number): Mp3Frame {
  const bytes = new Uint8Array(417);
  bytes[0] = 0xff;
  bytes[1] = 0xfb;
  bytes[2] = 0x90;
  bytes[3] = marker & 0xff;
  return { bytes, hasPadding: false };
}

function fakeSource(markers: number[], failed = false) {
  const remaining = [...markers];
  let killCalls = 0;
  let framesTaken = 0;
  return {
    get killCalls() {
      return killCalls;
    },
    get framesTaken() {
      return framesTaken;
    },
    buffered: 0,
    finished: true,
    ready: Promise.resolve(),
    take(n: number) {
      const out = remaining.splice(0, n).map((m) => syntheticFrame(m));
      framesTaken += out.length;
      return out;
    },
    isFailed: () => failed,
    kill() {
      killCalls += 1;
    },
  } as unknown as FrameSource & { killCalls: number };
}

function captureStream(): { controller: ReadableStreamDefaultController<Uint8Array>; chunks: Uint8Array[] } {
  const chunks: Uint8Array[] = [];
  let controllerRef!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controllerRef = c;
    },
    pull() {
      // chunks are collected synchronously at enqueue time
    },
  });
  void stream;
  const origEnqueue = controllerRef.enqueue.bind(controllerRef);
  controllerRef.enqueue = (chunk: Uint8Array) => {
    chunks.push(chunk);
    try {
      origEnqueue(chunk);
    } catch {
      /* reader detached */
    }
  };
  return { controller: controllerRef, chunks };
}

function makeBroadcaster() {
  const clock = { value: 0 };
  const events: BroadcasterEvent[] = [];
  const b = new Broadcaster({
    silenceFrames: makeSyntheticSilenceFrames(90).map((f, i) => ({
      ...f,
      bytes: syntheticFrame(200 + i).bytes,
    })),
    clock: () => clock.value,
  });
  b.onEvent = (e) => events.push(e);
  return { b, clock, events };
}

describe("Broadcaster", () => {
  test("unpausing bursts the full lead and serves it to a joining client", () => {
    const { b, clock } = makeBroadcaster();
    b.start(false);
    const { controller, chunks } = captureStream();
    b.addClient({ id: 1, userId: 1 }, controller);
    b.tick();
    expect(b.emittedFrames).toBe(115);
    clock.value = 1000;
    b.tick();
    expect(b.emittedFrames).toBe(115 + 38);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const intro = chunks[0]!;
    expect(intro.length).toBe(115 * 417);
    expect(intro[3]).toBe(200);
    b.stop();
  });

  test("joining mid-stream receives ring backlog", () => {
    const { b, clock } = makeBroadcaster();
    b.start(false);
    const first = captureStream();
    b.addClient({ id: 1, userId: 1 }, first.controller);
    b.tick();
    clock.value = 5000;
    b.tick();
    const second = captureStream();
    b.addClient({ id: 2, userId: 2 }, second.controller);
    expect(second.chunks[0]!.length).toBe(155 * 417);
    b.stop();
  });

  test("gapless switch consumes prepared next source", () => {
    const { b, clock, events } = makeBroadcaster();
    const trackA = fakeSource([0, 1]);
    const trackB = fakeSource([10, 11]);
    b.start(false);
    b.setTrack(trackA);
    b.setNextSource(trackB);
    b.tick();
    clock.value = 6000;
    b.tick();
    expect(trackA.killCalls).toBe(1);
    const switched = events.find((e) => e.type === "track_switched");
    expect(switched).toBeTruthy();
    expect(trackB.framesTaken).toBeGreaterThan(0);
    b.stop();
  });

  test("silence fills until a track is set; ended reported once", () => {
    const { b, clock, events } = makeBroadcaster();
    b.start(false);
    b.addClient({ id: 1, userId: 1 }, captureStream().controller);
    b.tick();
    expect(b.emittedFrames).toBe(115);
    expect(events.length).toBe(0);
    clock.value = 2000;
    b.tick();
    b.stop();
  });

  test("positionMs stays in [0, lead) right after start and grows with frames", () => {
    const { b } = makeBroadcaster();
    b.start(false);
    b.setTrack(fakeSource([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    b.tick();
    const pos0 = b.positionMs;
    expect(pos0).toBeGreaterThanOrEqual(0);
    expect(pos0).toBeLessThanOrEqual(FRAME_MS * 2);
    b.stop();
  });

  test("paused tick is a no-op and resume re-anchors with a full burst", () => {
    const { b, clock } = makeBroadcaster();
    b.start(true);
    b.addClient({ id: 1, userId: 1 }, captureStream().controller);
    b.tick();
    expect(b.emittedFrames).toBe(0);
    b.setPaused(false);
    b.tick();
    expect(b.emittedFrames).toBe(115);
    b.setPaused(true);
    clock.value = 999999;
    b.tick();
    expect(b.emittedFrames).toBe(115);
    b.stop();
  });
});
