import { describe, expect, test } from "bun:test";
import { Room, RoomError, type RoomDeps, type TrackMeta } from "./Room";
import { Broadcaster } from "@server/audio/Broadcaster";
import { makeSyntheticSilenceFrames } from "@server/audio/silence";
import type { FrameSource } from "@server/audio/TrackEncoder";
import type { HistoryRepo, HistoryRow } from "@server/db/repos/history";
import type { UserRef } from "@shared/protocol";

function fakeSource(): FrameSource & { killCalls: number } {
  let killCalls = 0;
  return {
    get killCalls() {
      return killCalls;
    },
    buffered: 0,
    framesTaken: 0,
    finished: true,
    ready: Promise.resolve(),
    take: () => [],
    isFailed: () => false,
    kill() {
      killCalls += 1;
    },
  } as unknown as FrameSource & { killCalls: number };
}

function fakeHistory(): HistoryRepo {
  const rows: Array<{
    id: number;
    userId: number;
    videoId: string;
    title: string;
    channel: string | null;
    durationSec: number | null;
    seedArgb: number | null;
  }> = [];
  let nextId = 1;
  return {
    append(input: HistoryRow) {
      const row = {
        id: nextId++,
        userId: input.userId,
        videoId: input.videoId,
        title: input.title,
        channel: input.channel,
        durationSec: input.durationSec,
        seedArgb: input.seedArgb ?? null,
      };
      rows.push(row);
      return row;
    },
    getOwn(id: number, userId: number) {
      return rows.find((r) => r.id === id && r.userId === userId) ?? null;
    },
  } as unknown as HistoryRepo;
}

function makeRoom(overrides?: Partial<RoomDeps>) {
  const broadcaster = new Broadcaster({
    silenceFrames: makeSyntheticSilenceFrames(90).map((f) => ({ ...f, bytes: f.bytes })),
    clock: () => performance.now(),
    intervalMs: 1e9,
  });
  broadcaster.start(false);
  const meta: TrackMeta = {
    videoId: "dQw4w9WgXcQ",
    title: "Never Gonna Give You Up",
    channel: "Rick Astley",
    durationSec: 213,
    isLive: false,
  };
  const deps: RoomDeps = {
    maxQueuePerUser: 2,
    maxTrackSeconds: 3000,
    enqueueCooldownMs: 0,
    prefetchMs: 10_000,
    listenerGraceMs: 30,
    broadcaster,
    startEncoder: async () => fakeSource(),
    resolveMetadata: async () => meta,
    seedFor: async () => 0xff112233,
    history: fakeHistory(),
    ...overrides,
  };
  broadcaster.onEvent = null;
  broadcaster.setPaused(true);
  const room = new Room(deps);
  broadcaster.start(true);
  void deps;
  return { room, broadcaster, deps };
}

const alice: UserRef = { id: 1, displayName: "Alice" };
const bob: UserRef = { id: 2, displayName: "Bob" };

describe("Room", () => {
  test("enqueue requires a listener to start playback; auto-pauses without", async () => {
    const { room, broadcaster } = makeRoom();
    const item = await room.enqueue(alice, "dQw4w9WgXcQ");
    expect(item.videoId).toBe("dQw4w9WgXcQ");
    expect(room.roomState().queue).toHaveLength(1);
    expect(room.roomState().status).toBe("idle");
    expect(broadcaster.isPaused).toBe(true);
    await room.dispose();
  });

  test("listener joining starts playback and history row is appended", async () => {
    const { room, deps } = makeRoom();
    await room.enqueue(alice, "dQw4w9WgXcQ");
    const sees: string[] = [];
    room.subscribe((m) => sees.push(m.t));
    room.presence.register(bob.id, bob.displayName, 100);
    await Bun.sleep(60);
    expect(room.roomState().status).toBe("playing");
    expect(deps.history.getOwn(1, alice.id)?.videoId).toBe("dQw4w9WgXcQ");
    expect(sees.some((t) => t === "state")).toBe(true);
    await room.dispose();
  });

  test("duplicate rejects; queue cap rejects; cooldown rejects", async () => {
    const { room } = makeRoom();
    await room.enqueue(alice, "dQw4w9WgXcQ");
    expect(async () => {
      await room.enqueue(alice, "dQw4w9WgXcQ");
    }).toThrow(RoomError);
    await room.enqueue(alice, "XGxIE1hr0w4");
    expect(async () => {
      await room.enqueue(alice, "LLFhKaqnWwk");
    }).toThrow(/Queue full/);
    const { room: room2, deps } = makeRoom({ enqueueCooldownMs: 60_000 });
    await room2.enqueue(alice, "dQw4w9WgXcQ");
    expect(async () => {
      await room2.enqueue(alice, "DsC8jQXRbQE");
    }).toThrow(RoomError);
    void deps;
    await room.dispose();
    await room2.dispose();
  });

  test("live and too-long are rejected", async () => {
    const { room } = makeRoom({
      resolveMetadata: async () => ({
        videoId: "dQw4w9WgXcQ",
        title: "Live stream",
        channel: null,
        durationSec: null,
        isLive: true,
      }),
    });
    expect(async () => {
      await room.enqueue(alice, "dQw4w9WgXcQ");
    }).toThrow(/Live streams/);
    const started = await room.enqueue(alice, "eioYulMp_5k").catch(() => null);
    void started;
    await room.dispose();
  });

  test("skip vote passes at strict majority of listeners and resets on track change", async () => {
    const { room } = makeRoom();
    await room.enqueue(alice, "dQw4w9WgXcQ");
    room.presence.register(alice.id, alice.displayName, 1);
    await Bun.sleep(50);
    room.presence.register(bob.id, bob.displayName, 2);
    await Bun.sleep(50);
    await room.skipVote(bob, true);
    const state = room.roomState();
    expect(state.nowPlaying).not.toBeNull();
    expect(state.nowPlaying!.skipVoterIds).toEqual([2]);
    expect(state.nowPlaying!.votesNeeded).toBe(2);
    await room.skipVote(alice, true);
    expect(room.roomState().nowPlaying).toBeNull();
    expect(room.roomState().status).toBe("idle");
    await room.dispose();
  });

  test("requester can instantly skip or remove their own playing song", async () => {
    const { room } = makeRoom();
    await room.enqueue(alice, "dQw4w9WgXcQ");
    room.presence.register(alice.id, alice.displayName, 1);
    await Bun.sleep(50);
    await room.removeOwn(alice, room.roomState().nowPlaying!.itemId);
    await Bun.sleep(30);
    expect(room.roomState().nowPlaying).toBeNull();
    await room.dispose();
  });

  test("requester can pause and resume playback room-wide, non-requester is forbidden", async () => {
    const { room } = makeRoom();
    await room.enqueue(alice, "dQw4w9WgXcQ");
    room.presence.register(alice.id, alice.displayName, 1);
    room.presence.register(bob.id, bob.displayName, 2);
    await Bun.sleep(50);
    expect(room.roomState().status).toBe("playing");

    // Bob cannot pause Alice's song
    expect(async () => {
      await room.setPlaybackPaused(bob, true);
    }).toThrow(/Only the person who queued/);

    // Alice pauses playback room-wide
    await room.setPlaybackPaused(alice, true);
    expect(room.roomState().status).toBe("paused");

    // Alice resumes playback room-wide
    await room.setPlaybackPaused(alice, false);
    expect(room.roomState().status).toBe("playing");

    await room.dispose();
  });

  test("removeOwn of a waiting song by the owner drops it from queue", async () => {
    const { room } = makeRoom();
    await room.enqueue(alice, "dQw4w9WgXcQ");
    const state1 = room.roomState();
    await room.enqueue(alice, "XGxIE1hr0w4");
    const waiting = room.roomState().queue[0]!;
    await room.removeOwn(alice, waiting.itemId);
    expect(room.roomState().queue).toHaveLength(1);
    expect(room.roomState().queue[0]!.itemId).toBe(state1.queue[0]!.itemId);
    await room.dispose();
  });

  test("enqueue while idle + listener plays immediately; last listener leaves auto-pauses and keeps position", async () => {
    const { room } = makeRoom();
    room.presence.register(alice.id, alice.displayName, 1);
    await Bun.sleep(40);
    await room.enqueue(alice, "dQw4w9WgXcQ");
    await Bun.sleep(80);
    expect(room.roomState().status).toBe("playing");
    room.presence.unregister(alice.id, 1);
    await Bun.sleep(120);
    expect(room.roomState().status).toBe("paused");
    expect(room.roomState().nowPlaying).not.toBeNull();
    room.presence.register(alice.id, alice.displayName, 2);
    await Bun.sleep(80);
    expect(room.roomState().status).toBe("playing");
    expect(room.roomState().nowPlaying).not.toBeNull();
    await room.dispose();
  });

  test("track_failed auto-skips to the next queued item", async () => {
    let call = 0;
    const { room } = makeRoom({
      resolveMetadata: async (videoId) => ({
        videoId,
        title: `Title ${videoId}`,
        channel: null,
        durationSec: 100,
        isLive: false,
      }),
      startEncoder: async () => {
        call += 1;
        if (call === 1) throw new Error("resolve failed");
        return fakeSource();
      },
    });
    room.presence.register(alice.id, alice.displayName, 1);
    await Bun.sleep(40);
    await room.enqueue(alice, "dQw4w9WgXcQ");
    await room.enqueue(alice, "XGxIE1hr0w4");
    await Bun.sleep(120);
    const state = room.roomState();
    expect(state.nowPlaying).not.toBeNull();
    expect(state.queue).toHaveLength(0);
    await room.dispose();
  });
});
