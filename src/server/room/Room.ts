import { randomUUID } from "node:crypto";
import type { Broadcaster, BroadcasterEvent } from "@server/audio/Broadcaster";
import type { FrameSource } from "@server/audio/TrackEncoder";
import { createMutex } from "@server/room/mutex";
import { createPresence, type Presence } from "@server/room/presence";
import { majorityReached, createVotes } from "@server/room/votes";
import type {
  RoomEvent,
  RoomEventInput,
  RoomState,
  RoomStatus,
  ServerMsg,
  QueueItem,
  UserRef,
} from "@shared/protocol";
import type { HistoryRepo } from "@server/db/repos/history";

export interface TrackMeta {
  videoId: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
  isLive: boolean;
}

export interface RoomDeps {
  maxQueuePerUser: number;
  maxTrackSeconds: number;
  enqueueCooldownMs: number;
  prefetchMs: number;
  listenerGraceMs: number;
  broadcaster: Broadcaster;
  startEncoder(item: QueueItem): Promise<FrameSource>;
  resolveMetadata(videoId: string): Promise<TrackMeta | null>;
  seedFor(videoId: string): Promise<number | null>;
  history: HistoryRepo;
}

export interface CurrentTrack {
  item: QueueItem;
  votes: Set<number>;
}

export class RoomError extends Error {
  constructor(
    readonly code: import("@shared/protocol").ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RoomError";
  }
}

export class Room {
  readonly presence: Presence;
  private readonly deps: RoomDeps;
  private readonly mutex = createMutex();
  private readonly subscribers = new Set<(msg: ServerMsg) => void>();
  private readonly cooldowns = new Map<number, number>();
  private status: RoomStatus = "idle";
  private current: CurrentTrack | null = null;
  private currentSource: FrameSource | null = null;
  private queue: QueueItem[] = [];
  private prepared: { itemId: string; source: FrameSource } | null = null;
  private prefetchTimer: ReturnType<typeof setTimeout> | null = null;
  private version = 0;
  private readonly recentEvents: RoomEvent[] = [];
  private readonly votes = createVotes();
  private disposed = false;
  private publishScheduled = false;
  private userPaused = false;

  constructor(deps: RoomDeps) {
    this.deps = deps;
    this.presence = createPresence({ graceMs: deps.listenerGraceMs });
    this.presence.onJoin = (user) => {
      void this.mutex
        .runExclusive(async () => {
          const actor: UserRef = { id: user.userId, displayName: user.displayName };
          this.emitEvent({ kind: "joined", actor });
          if (this.presence.listenerCount() > 0) {
            if (!this.userPaused) {
              this.deps.broadcaster.setPaused(false);
              if (!this.current && this.queue.length > 0) await this.advance();
              else {
                if (this.current) this.status = "playing";
                this.publishState();
              }
            } else {
              this.publishState();
            }
          } else {
            this.publishState();
          }
          await this.evaluateSkip();
        })
        .catch(() => undefined);
    };
    this.presence.onLeave = (user) => {
      void this.mutex
        .runExclusive(async () => {
          const actor: UserRef = { id: user.userId, displayName: user.displayName };
          this.emitEvent({ kind: "left", actor });
          if (this.presence.listenerCount() === 0) {
            if (this.current) {
              this.status = "paused";
              this.deps.broadcaster.setPaused(true);
            } else {
              this.status = "idle";
            }
          }
          this.publishState();
          await this.evaluateSkip();
        })
        .catch(() => undefined);
    };
    deps.broadcaster.onEvent = (event) => {
      void this.onBroadcasterEvent(event);
    };
  }

  subscribe(listener: (msg: ServerMsg) => void): () => void {
    this.subscribers.add(listener);
    listener({ t: "state", state: this.roomState() });
    return () => {
      this.subscribers.delete(listener);
    };
  }

  recentEventsLog(): RoomEvent[] {
    return this.recentEvents;
  }

  isListener(userId: number): boolean {
    return this.presence.isListener(userId);
  }

  async enqueue(user: UserRef, videoId: string): Promise<QueueItem> {
    this.assertCooldown(user.id);
    const meta = await this.deps.resolveMetadata(videoId);
    if (!meta) throw new RoomError("UNAVAILABLE", "Could not load metadata for that video.");
    if (meta.isLive) throw new RoomError("LIVE_NOT_ALLOWED", "Live streams can't be queued.");
    if (meta.durationSec === null || meta.durationSec > this.deps.maxTrackSeconds) {
      throw new RoomError("TOO_LONG", "That track is too long for the room.");
    }
    const seedArgb = await this.deps.seedFor(videoId);

    return this.mutex.runExclusive(() => {
      this.assertEnqueuable(user.id, videoId);
      const item: QueueItem = {
        videoId: meta.videoId,
        title: meta.title,
        channel: meta.channel,
        durationSec: meta.durationSec,
        seedArgb: seedArgb ?? null,
        itemId: randomUUID(),
        requestedBy: { id: user.id, displayName: user.displayName },
        queuedAt: Date.now(),
      };
      this.commitEnqueue(user, item);
      return item;
    });
  }

  async enqueueFromHistory(
    user: UserRef,
    row: {
      videoId: string;
      title: string;
      channel: string | null;
      durationSec: number | null;
      seedArgb: number | null;
    },
  ): Promise<QueueItem> {
    this.assertCooldown(user.id);
    if (row.durationSec === null || row.durationSec > this.deps.maxTrackSeconds) {
      throw new RoomError("TOO_LONG", "That track is too long for the room.");
    }
    return this.mutex.runExclusive(() => {
      this.assertEnqueuable(user.id, row.videoId);
      const item: QueueItem = {
        videoId: row.videoId,
        title: row.title,
        channel: row.channel,
        durationSec: row.durationSec,
        seedArgb: row.seedArgb,
        itemId: randomUUID(),
        requestedBy: { id: user.id, displayName: user.displayName },
        queuedAt: Date.now(),
      };
      this.commitEnqueue(user, item);
      return item;
    });
  }

  async removeOwn(user: UserRef, itemId: string): Promise<void> {
    return this.mutex.runExclusive(async () => {
      const idx = this.queue.findIndex((i) => i.itemId === itemId);
      if (idx !== -1) {
        const item = this.queue[idx]!;
        if (item.requestedBy.id !== user.id) {
          throw new RoomError("FORBIDDEN", "You can only remove your own songs.");
        }
        this.queue.splice(idx, 1);
        if (this.prepared?.itemId === itemId) {
          this.prepared.source.kill();
          this.prepared = null;
          this.deps.broadcaster.setNextSource(null);
        }
        this.emitEvent({ kind: "removed", actor: user, title: item.title });
        this.publishState();
        return;
      }
      if (this.current && this.current.item.itemId === itemId) {
        if (this.current.item.requestedBy.id !== user.id) {
          throw new RoomError("FORBIDDEN", "You can only remove your own songs.");
        }
        await this.doSkip(user, "removed");
        return;
      }
      throw new RoomError("NOT_FOUND", "That song is not waiting.");
    });
  }

  async skipVote(user: UserRef, vote: boolean): Promise<{ votes: number; votesNeeded: number }> {
    return this.mutex.runExclusive(async () => {
      if (!this.current) throw new RoomError("NOTHING_PLAYING", "Nothing is playing right now.");
      if (!this.presence.isListener(user.id)) {
        throw new RoomError("NOT_LISTENING", "Join the room to vote.");
      }
      const needed = this.votes.needed(Math.max(this.presence.listenerCount(), 1));
      if (vote && this.current.item.requestedBy.id === user.id) {
        await this.doSkip(user, "removed");
        return { votes: 0, votesNeeded: needed };
      }
      if (vote) {
        this.current.votes.add(user.id);
        this.emitEvent({ kind: "skip_vote", actor: user, title: this.current.item.title });
      } else {
        this.current.votes.delete(user.id);
      }
      await this.evaluateSkip();
      const valid = this.current
        ? [...this.current.votes].filter((id) => this.presence.isListener(id)).length
        : 0;
      return { votes: valid, votesNeeded: needed };
    });
  }

  forceSkip(user: UserRef): Promise<void> {
    return this.mutex.runExclusive(async () => {
      if (!this.current) throw new RoomError("NOTHING_PLAYING", "Nothing is playing right now.");
      if (this.current.item.requestedBy.id !== user.id) {
        throw new RoomError("FORBIDDEN", "You can only remove your own songs.");
      }
      await this.doSkip(user, "removed");
    });
  }

  setPlaybackPaused(user: UserRef, paused: boolean): Promise<RoomStatus> {
    return this.mutex.runExclusive(async () => {
      if (!this.current) throw new RoomError("NOTHING_PLAYING", "Nothing is playing right now.");
      if (this.current.item.requestedBy.id !== user.id) {
        throw new RoomError("FORBIDDEN", "Only the person who queued this track can pause playback.");
      }
      if (paused) {
        this.userPaused = true;
        if (this.status !== "paused") {
          this.status = "paused";
          this.deps.broadcaster.setPaused(true);
          this.emitEvent({ kind: "paused", actor: user, title: this.current.item.title });
          this.publishState();
        }
      } else {
        this.userPaused = false;
        if (this.presence.listenerCount() > 0) {
          if (this.status === "paused") {
            this.status = "playing";
            this.deps.broadcaster.setPaused(false);
            this.emitEvent({ kind: "resumed", actor: user, title: this.current.item.title });
            this.publishState();
          }
        } else {
          this.publishState();
        }
      }
      return this.status;
    });
  }

  roomState(): RoomState {
    const electorate = this.presence.listenerCount();
    const nowPlaying = this.current
      ? {
          videoId: this.current.item.videoId,
          title: this.current.item.title,
          channel: this.current.item.channel,
          durationSec: this.current.item.durationSec,
          seedArgb: this.current.item.seedArgb ?? null,
          itemId: this.current.item.itemId,
          requestedBy: this.current.item.requestedBy,
          queuedAt: this.current.item.queuedAt,
          positionMs: Math.round(this.deps.broadcaster.positionMs),
          skipVoterIds: [...this.current.votes].filter((id) => this.presence.isListener(id)),
          votesNeeded: this.votes.needed(Math.max(electorate, 1)),
        }
      : null;
    return {
      version: this.version,
      serverTimeMs: Date.now(),
      status: this.status,
      nowPlaying,
      queue: this.queue,
      listeners: this.presence.listListeners().map((u) => ({ id: u.userId, displayName: u.displayName })),
      limits: {
        maxQueuePerUser: this.deps.maxQueuePerUser,
        maxTrackSeconds: this.deps.maxTrackSeconds,
      },
    };
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.prefetchTimer) clearTimeout(this.prefetchTimer);
    this.presence.stopAll();
    this.currentSource?.kill();
    this.prepared?.source.kill();
    this.subscribers.clear();
  }

  private async onBroadcasterEvent(event: BroadcasterEvent): Promise<void> {
    if (this.disposed || event.type === "error") return;
    if (event.type === "track_ended") {
      await this.mutex.runExclusive(async () => {
        await this.advance();
      });
      return;
    }
    if (event.type === "track_switched") {
      await this.mutex.runExclusive(async () => {
        const next = this.queue.length > 0 ? this.queue[0] : null;
        if (next && (!this.prepared || this.prepared.itemId === next.itemId)) {
          this.current = { item: next, votes: new Set() };
          this.currentSource = this.prepared?.source ?? null;
          if (this.prepared) {
            this.prepared = null;
            this.deps.broadcaster.setNextSource(null);
          }
          this.queue.shift();
          if (this.currentSource) this.deps.broadcaster.setTrack(this.currentSource);
          this.status = "playing";
          this.schedulePrefetch();
        } else {
          this.current = null;
          this.currentSource = null;
          this.status = "idle";
        }
        this.publishState();
      });
    }
  }

  private async advance(): Promise<void> {
    for (;;) {
      if (this.presence.listenerCount() === 0) {
        if (this.current) {
          this.status = "paused";
          this.deps.broadcaster.setPaused(true);
        } else {
          this.status = "idle";
        }
        this.publishState();
        return;
      }
      const next = this.queue[0];
      if (!next) {
        this.current = null;
        this.currentSource = null;
        this.status = "idle";
        this.deps.broadcaster.setTrack(null);
        this.publishState();
        return;
      }
      if (this.current && this.current.item.itemId === next.itemId) {
        this.status = "playing";
        return;
      }
      this.status = "loading";
      this.publishState();
      let source: FrameSource | null = null;
      if (this.prepared && this.prepared.itemId === next.itemId) {
        source = this.prepared.source;
        this.prepared = null;
      } else {
        try {
          source = await this.deps.startEncoder(next);
        } catch {
          this.emitEvent({ kind: "track_failed", title: next.title, detail: next.videoId });
          this.queue.shift();
          continue;
        }
      }
      this.queue.shift();
      this.current = { item: next, votes: new Set() };
      this.currentSource = source;
      this.deps.broadcaster.setTrack(source);
      this.deps.broadcaster.setNextSource(null);
      this.userPaused = false;
      this.status = "playing";
      this.publishState();
      this.schedulePrefetch();
      return;
    }
  }

  private schedulePrefetch(): void {
    if (this.prefetchTimer) {
      clearTimeout(this.prefetchTimer);
      this.prefetchTimer = null;
    }
    if (!this.current || this.queue.length === 0 || this.prepared) return;
    const durationSec = this.current.item.durationSec ?? 0;
    const remainingMs = Math.max(0, durationSec * 1000 - this.deps.broadcaster.positionMs);
    const delay = Math.max(0, Math.min(remainingMs - this.deps.prefetchMs, 120_000));
    this.prefetchTimer = setTimeout(() => {
      void this.mutex
        .runExclusive(async () => {
          if (!this.current || this.queue.length === 0 || this.prepared) return;
          const candidate = this.queue[0];
          if (!candidate) return;
          try {
            const source = await this.deps.startEncoder(candidate);
            this.prepared = { itemId: candidate.itemId, source };
            this.deps.broadcaster.setNextSource(source);
          } catch {
            this.prepared = null;
          }
        })
        .catch(() => undefined);
    }, delay);
    this.prefetchTimer.unref?.();
  }

  private async evaluateSkip(): Promise<void> {
    if (!this.current) return;
    const valid = [...this.current.votes].filter((id) => this.presence.isListener(id)).length;
    if (majorityReached(valid, this.presence.listenerCount())) {
      await this.doSkip(undefined, "skipped");
      return;
    }
    this.publishState();
  }

  private async doSkip(actor: UserRef | undefined, kind: "removed" | "skipped"): Promise<void> {
    const item = this.current?.item;
    this.userPaused = false;
    this.current = null;
    if (this.currentSource) {
      this.currentSource.kill();
      this.currentSource = null;
    }
    this.deps.broadcaster.setTrack(null);
    this.deps.broadcaster.setNextSource(null);
    if (item) {
      this.emitEvent(
        actor
          ? { kind, actor, title: item.title, detail: item.videoId }
          : { kind, title: item.title, detail: item.videoId },
      );
    }
    await this.advance();
    this.publishState();
  }

  private assertCooldown(userId: number): void {
    const last = this.cooldowns.get(userId) ?? 0;
    if (Date.now() - last < this.deps.enqueueCooldownMs) {
      throw new RoomError("RATE_LIMITED", "Slow down before queueing again.");
    }
  }

  private assertEnqueuable(userId: number, videoId: string): void {
    if (this.current?.item.videoId === videoId || this.queue.some((i) => i.videoId === videoId)) {
      throw new RoomError("DUPLICATE", "That song is already playing or queued.");
    }
    const waiting = this.queue.filter((i) => i.requestedBy.id === userId).length;
    if (waiting >= this.deps.maxQueuePerUser) {
      throw new RoomError("QUEUE_FULL", `Queue full (${waiting}/${this.deps.maxQueuePerUser}).`);
    }
  }

  private commitEnqueue(user: UserRef, item: QueueItem): void {
    this.queue.push(item);
    this.deps.history.append({
      userId: user.id,
      videoId: item.videoId,
      title: item.title,
      channel: item.channel,
      durationSec: item.durationSec,
      seedArgb: item.seedArgb ?? null,
    });
    this.cooldowns.set(user.id, Date.now());
    this.emitEvent({ kind: "queued", actor: user, title: item.title, detail: item.videoId });
    void this.mutex
      .runExclusive(async () => {
        if (!this.current && this.presence.listenerCount() > 0 && this.queue[0]?.itemId === item.itemId) {
          await this.advance();
        } else {
          this.publishState();
        }
      })
      .catch(() => undefined);
    this.publishState();
  }

  private emitEvent(event: RoomEventInput): void {
    const full = { ...event, atMs: Date.now() } as RoomEvent;
    this.recentEvents.push(full);
    if (this.recentEvents.length > 50) this.recentEvents.splice(0, this.recentEvents.length - 50);
    const msg: ServerMsg = { t: "event", ev: full };
    for (const sub of this.subscribers) sub(msg);
  }

  private publishState(): void {
    if (this.publishScheduled) return;
    this.publishScheduled = true;
    queueMicrotask(() => {
      this.publishScheduled = false;
      this.version += 1;
      const msg: ServerMsg = { t: "state", state: this.roomState() };
      for (const sub of this.subscribers) sub(msg);
    });
  }
}
