import { z } from "zod";
import type { QueueItem } from "@shared/protocol";
import type { UsersRepo } from "@server/db/repos/users";
import { timingSafeEq } from "@server/auth/invite";
import { fail, json, noContent, handle } from "./errors";
import { assertMutationAllowed, readJsonBody, requireUser, type Ctx } from "./middleware";

const queueSchema = z.union([
  z.object({ videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/) }),
  z.object({ url: z.string().min(4).max(2048) }),
  z.object({ historyId: z.number().int().positive() }),
]);

const playSchema = z
  .object({
    url: z.string().min(1, "url is required"),
    user: z.string().min(1).optional(),
    username: z.string().min(1).optional(),
  })
  .refine((data) => Boolean(data.user || data.username), {
    message: "user is required",
    path: ["user"],
  });

const skipVoteSchema = z.object({ vote: z.boolean() });

export interface RoomApi {
  enqueue(user: { id: number; displayName: string }, videoId: string): Promise<QueueItem>;
  enqueueFromHistory(
    user: { id: number; displayName: string },
    meta: {
      videoId: string;
      title: string;
      channel: string | null;
      durationSec: number | null;
      seedArgb: number | null;
    },
  ): Promise<QueueItem>;
  resolveEnqueueTarget(
    data: { videoId: string } | { url: string } | { historyId: number },
    user: { id: number; displayName: string },
  ): Promise<
    | { kind: "video"; videoId: string }
    | {
        kind: "history";
        row: {
          videoId: string;
          title: string;
          channel: string | null;
          durationSec: number | null;
          seedArgb: number | null;
        };
      }
  >;
  removeOwn(user: { id: number; displayName: string }, itemId: string): Promise<void>;
  skipVote(
    user: { id: number; displayName: string },
    vote: boolean,
  ): Promise<{ votes: number; votesNeeded: number }>;
  setPlaybackPaused(
    user: { id: number; displayName: string },
    paused: boolean,
  ): Promise<import("@shared/protocol").RoomStatus>;
  isListener(userId: number): boolean;
}

export interface QueueRouteDeps extends Ctx {
  room: RoomApi;
  limiterEnqueue(userId: number): boolean;
  users: UsersRepo;
  apiToken: string;
}

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "Authorization, Content-Type",
};

export function makeQueueRoutes(deps: QueueRouteDeps) {
  const enqueue = handle(async (req) => {
    assertMutationAllowed(deps, req);
    const user = requireUser(deps, req);
    if (!deps.limiterEnqueue(user.id)) {
      throw fail(429, "RATE_LIMITED", "Slow down.");
    }
    const body = await readJsonBody(deps, req);
    const parsed = queueSchema.safeParse(body);
    if (!parsed.success) {
      throw fail(400, "VALIDATION", "Send {videoId}, {url} or {historyId}.");
    }
    const target = await deps.room.resolveEnqueueTarget(parsed.data, user);
    if (target.kind === "video") {
      if (!VIDEO_ID_RE.test(target.videoId)) throw fail(400, "YOUTUBE_ERROR", "Invalid video id.");
      const item = await deps.room.enqueue(user, target.videoId);
      return json(201, { item });
    }
    const item = await deps.room.enqueueFromHistory(user, target.row);
    return json(201, { item });
  });

  const remove = handle(async (req) => {
    assertMutationAllowed(deps, req);
    const user = requireUser(deps, req);
    const url = new URL(req.url);
    const itemId = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    if (!itemId || itemId.length < 8) throw fail(404, "NOT_FOUND", "No such queued song.");
    await deps.room.removeOwn(user, itemId);
    return noContent();
  });

  const skipVote = handle(async (req) => {
    assertMutationAllowed(deps, req);
    const user = requireUser(deps, req);
    const body = await readJsonBody(deps, req);
    const parsed = skipVoteSchema.safeParse(body);
    if (!parsed.success) throw fail(400, "VALIDATION", "vote must be boolean.");
    const result = await deps.room.skipVote(user, parsed.data.vote);
    return json(200, result);
  });

  const playbackSchema = z.object({ paused: z.boolean() });
  const setPlayback = handle(async (req) => {
    assertMutationAllowed(deps, req);
    const user = requireUser(deps, req);
    const body = await readJsonBody(deps, req);
    const parsed = playbackSchema.safeParse(body);
    if (!parsed.success) throw fail(400, "VALIDATION", "paused must be boolean.");
    const status = await deps.room.setPlaybackPaused(user, parsed.data.paused);
    return json(200, { status });
  });

  const play = handle(async (req) => {
    const expectedToken = (deps.apiToken || process.env.API_TOKEN || "").trim();
    if (!expectedToken) {
      throw fail(401, "UNAUTHENTICATED", "API token not configured.", CORS_HEADERS);
    }
    const authHeader = req.headers.get("authorization") ?? "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();
    if (!token || !timingSafeEq(token, expectedToken)) {
      throw fail(401, "UNAUTHENTICATED", "Invalid or missing API token.", CORS_HEADERS);
    }

    const body = await readJsonBody(deps, req);
    const parsed = playSchema.safeParse(body);
    if (!parsed.success) {
      throw fail(400, "VALIDATION", "Send { url, user } in JSON body.", CORS_HEADERS);
    }

    const username = (parsed.data.user ?? parsed.data.username)!.trim();
    const user = deps.users.getByUsername(username);
    if (!user) {
      throw fail(404, "NOT_FOUND", "User does not exist.", CORS_HEADERS);
    }

    if (!deps.room.isListener(user.id)) {
      throw fail(409, "NOT_LISTENING", "User is not in the room.", CORS_HEADERS);
    }

    const target = await deps.room.resolveEnqueueTarget({ url: parsed.data.url }, user);
    if (target.kind === "video") {
      if (!VIDEO_ID_RE.test(target.videoId)) {
        throw fail(400, "YOUTUBE_ERROR", "Invalid video id.", CORS_HEADERS);
      }
      const item = await deps.room.enqueue({ id: user.id, displayName: user.displayName }, target.videoId);
      return json(200, { ok: true, success: true, item }, CORS_HEADERS);
    }
    throw fail(400, "VALIDATION", "Invalid YouTube video URL.", CORS_HEADERS);
  });

  const playOptions = () => new Response(null, { status: 204, headers: CORS_HEADERS });

  return {
    "/api/queue": { POST: enqueue },
    "/api/queue/:itemId": { DELETE: remove },
    "/api/skip-vote": { PUT: skipVote },
    "/api/playback": { PUT: setPlayback },
    "/api/play": { POST: play, OPTIONS: playOptions },
  };
}
