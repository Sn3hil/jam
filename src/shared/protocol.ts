export type RoomStatus = "idle" | "loading" | "playing" | "paused";

export interface UserRef {
  id: number;
  displayName: string;
}

export interface TrackInfo {
  videoId: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
  seedArgb: number | null;
}

export interface QueueItem extends TrackInfo {
  itemId: string;
  requestedBy: UserRef;
  queuedAt: number;
}

export interface NowPlaying extends QueueItem {
  positionMs: number;
  skipVoterIds: number[];
  votesNeeded: number;
}

export interface RoomState {
  version: number;
  serverTimeMs: number;
  status: RoomStatus;
  nowPlaying: NowPlaying | null;
  queue: QueueItem[];
  listeners: UserRef[];
  limits: { maxQueuePerUser: number; maxTrackSeconds: number };
}

export interface UserDTO {
  id: number;
  username: string;
  displayName: string;
}

export interface SearchResult {
  videoId: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
}

export interface VideoInfo {
  videoId: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
  isLive: boolean;
}

export interface HistoryItem {
  id: number;
  videoId: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
  queuedAt: number;
  times?: number;
}

export const votesNeeded = (n: number): number => Math.floor(Math.max(n, 1) / 2) + 1;

export type RoomEvent = { atMs: number } & (
  | {
      kind: "queued" | "removed" | "skipped" | "skip_vote" | "track_failed" | "paused" | "resumed";
      actor?: UserRef;
      title?: string;
      detail?: string;
    }
  | { kind: "joined" | "left"; actor: UserRef }
);

export type DistributiveOmit<T, K extends string> = T extends unknown ? Omit<T, K> : never;

export type RoomEventInput = DistributiveOmit<RoomEvent, "atMs">;

export type ServerMsg = { t: "state"; state: RoomState } | { t: "event"; ev: RoomEvent } | { t: "pong" };

export type ClientMsg = { t: "ping" };

export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "BAD_INVITE"
  | "USERNAME_TAKEN"
  | "BAD_CREDENTIALS"
  | "QUEUE_FULL"
  | "DUPLICATE"
  | "TOO_LONG"
  | "LIVE_NOT_ALLOWED"
  | "PLAYLIST_NOT_SUPPORTED"
  | "NOT_LISTENING"
  | "NOTHING_PLAYING"
  | "AGE_RESTRICTED"
  | "UNAVAILABLE"
  | "REGION_LOCKED"
  | "YOUTUBE_ERROR";

export const STATUS_CODE_BY_ERROR: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  BAD_INVITE: 403,
  USERNAME_TAKEN: 409,
  BAD_CREDENTIALS: 401,
  QUEUE_FULL: 409,
  DUPLICATE: 409,
  TOO_LONG: 422,
  LIVE_NOT_ALLOWED: 422,
  PLAYLIST_NOT_SUPPORTED: 422,
  NOT_LISTENING: 409,
  NOTHING_PLAYING: 409,
  AGE_RESTRICTED: 422,
  UNAVAILABLE: 422,
  REGION_LOCKED: 422,
  YOUTUBE_ERROR: 502,
};

export interface ErrorBody {
  error: { code: ErrorCode; message: string };
}
