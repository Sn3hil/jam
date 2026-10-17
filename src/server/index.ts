import index from "@web/index.html";
import { openDatabase } from "@server/db";
import { runMigrations } from "@server/db/migrate";
import { makeUsersRepo } from "@server/db/repos/users";
import { makeHistoryRepo } from "@server/db/repos/history";
import { SessionManager } from "@server/auth/sessions";
import { createRateLimiter } from "@server/lib/rateLimit";
import { resolveBinary } from "@server/lib/binaries";
import { loadConfig } from "@server/config";
import { log } from "@server/lib/log";
import { makeAuthRoutes } from "./http/auth.routes";
import { makeSearchRoutes } from "./http/search.routes";
import { createYtdlpClient } from "@server/youtube/ytdlp";
import { createMetaCache } from "@server/youtube/metaCache";
import { getVideoInfoAny, searchYouTube, type SearchFetchDeps } from "@server/youtube/search";
import { makeStreamRoute } from "./http/stream.route";
import { makeQueueRoutes } from "./http/queue.routes";
import { makeHistoryRoutes } from "./http/history.routes";
import { wsMessageHandlers, type WsData } from "./ws";
import { ApiError, fail } from "./http/errors";
import { parseYouTubeInput } from "@shared/youtubeUrl";
import { Room } from "@server/room/Room";
import { TrackEncoder } from "@server/audio/TrackEncoder";
import { seedFromThumbnail } from "@server/color/seed";
import { Broadcaster } from "@server/audio/Broadcaster";
import { loadSilenceFrames } from "@server/audio/silence";
import { resolveFfmpegPath } from "@server/audio/ffmpeg";
import { BROADCAST_TICK_MS } from "@server/audio/constants";
import { join, dirname } from "node:path";

const migrationsDir = join(dirname(new URL(import.meta.url).pathname), "db", "migrations");

export async function bootServer() {
  const config = loadConfig(process.env as unknown as Record<string, string>);

  const db = openDatabase(config.dbPath);
  runMigrations(db, migrationsDir);
  const users = makeUsersRepo(db);
  const history = makeHistoryRepo(db);
  const session = new SessionManager({ db, ttlSeconds: config.sessionTtlSeconds });
  const limiter = createRateLimiter();
  session.clearExpired();

  const ytdlpBinary = await resolveBinary(config.ytdlpPath, "yt-dlp", ["./yt-dlp"]);
  if (!ytdlpBinary) {
    log.error("yt-dlp not found: install it or set YTDLP_PATH (see README).");
    process.exit(1);
  }
  const ytdlp = createYtdlpClient({
    ytdlpPath: ytdlpBinary,
    cookiesPath: config.ytdlpCookiesPath,
    jsRuntime: config.ytdlpJsRuntime,
    extraArgs: config.ytdlpExtraArgs.join(" "),
  });
  const metaCache = createMetaCache();
  const youtubeFetch: SearchFetchDeps = {
    ytdlp,
    getCachedResults: (q) => metaCache.getSearch(q),
    putCachedResults: (q, results) => metaCache.setSearch(q, results),
    getCachedVideo: (id) => metaCache.getVideo(id),
  };

  const authRoutes = makeAuthRoutes({
    session,
    publicOrigin: config.publicOrigin,
    maxBodyBytes: 4096,
    users,
    inviteCode: config.inviteCode,
    limiter,
  });
  const searchRoutes = makeSearchRoutes({
    session,
    publicOrigin: config.publicOrigin,
    maxBodyBytes: 4096,
    searchYouTube: (q: string, limit: number, signal?: AbortSignal) =>
      searchYouTube(youtubeFetch, q, limit, signal),
    getVideoInfo: (videoId: string, signal?: AbortSignal) => getVideoInfoAny(youtubeFetch, videoId, signal),
    limiterSearch: (userId: number) => limiter.hit(`search:${userId}`, 1, 400),
  });

  const ffmpegBinary = await resolveFfmpegPath(config);
  if (!ffmpegBinary) {
    log.error("ffmpeg not found: install it or set FFMPEG_PATH (see README).");
    process.exit(1);
  }
  const silenceFrames = await loadSilenceFrames(ffmpegBinary);
  log.info(`silence bank loaded: ${silenceFrames.length} frames`);
  const broadcaster = new Broadcaster({
    silenceFrames,
    clock: () => performance.now(),
    intervalMs: BROADCAST_TICK_MS,
  });
  broadcaster.start(true);
  const room = new Room({
    maxQueuePerUser: config.maxQueuePerUser,
    maxTrackSeconds: config.maxTrackSeconds,
    enqueueCooldownMs: config.enqueueCooldownMs,
    prefetchMs: config.prefetchSeconds * 1000,
    listenerGraceMs: config.listenerGraceMs,
    broadcaster,
    startEncoder: async (item) => {
      const url = await ytdlp.resolveStreamUrl(item.videoId);
      const encoder = new TrackEncoder({ ffmpegPath: ffmpegBinary, cdnUrl: url });
      await encoder.ready;
      if (encoder.isFailed() || encoder.buffered === 0) {
        encoder.kill();
        throw new Error(`encoder failed for ${item.videoId}`);
      }
      return encoder;
    },
    resolveMetadata: async (videoId) => {
      const cached = metaCache.getVideo(videoId);
      if (cached)
        return {
          videoId: cached.videoId,
          title: cached.title,
          channel: cached.channel,
          durationSec: cached.durationSec,
          isLive: cached.isLive,
        };
      try {
        const info = await getVideoInfoAny(youtubeFetch, videoId);
        return {
          videoId: info.videoId,
          title: info.title,
          channel: info.channel,
          durationSec: info.durationSec,
          isLive: info.isLive,
        };
      } catch {
        return null;
      }
    },
    seedFor: (videoId) => seedFromThumbnail(videoId),
    history,
  });
  const streamRoute = makeStreamRoute({
    broadcaster,
    presence: room.presence,
    session,
    publicOrigin: config.publicOrigin,
    maxBodyBytes: 4096,
  });

  const roomApi = Object.assign(room, {
    resolveEnqueueTarget: (
      data: { videoId: string } | { url: string } | { historyId: number },
      user: { id: number; displayName: string },
    ) => {
      if ("videoId" in data) return Promise.resolve({ kind: "video", videoId: data.videoId } as const);
      if ("url" in data) {
        const parsed = parseYouTubeInput(data.url);
        if (parsed.kind === "video")
          return Promise.resolve({ kind: "video", videoId: parsed.videoId } as const);
        if (parsed.kind === "playlist")
          throw new ApiError(422, "PLAYLIST_NOT_SUPPORTED", "Playlists aren't supported.");
        throw fail(400, "VALIDATION", "Send a YouTube link or use search.");
      }
      const row = history.getOwn(data.historyId, user.id);
      if (!row) throw fail(404, "NOT_FOUND", "No such history item.");
      return Promise.resolve({
        kind: "history",
        row: {
          videoId: row.videoId,
          title: row.title,
          channel: row.channel,
          durationSec: row.durationSec,
          seedArgb: row.seedArgb,
        },
      } as const);
    },
  });

  const queueRoutes = makeQueueRoutes({
    session,
    publicOrigin: config.publicOrigin,
    maxBodyBytes: 4096,
    room: roomApi,
    limiterEnqueue: (userId) => limiter.hit(`enqueue:${userId}`, 1, 2500),
    users,
    apiToken: config.apiToken,
  });
  const historyRoutes = makeHistoryRoutes({
    session,
    publicOrigin: config.publicOrigin,
    maxBodyBytes: 4096,
    listRecent: (userId, term, cursorId, limit) =>
      history.listRecent(userId, term, cursorId, limit).map((r) => ({
        id: r.id,
        videoId: r.videoId,
        title: r.title,
        channel: r.channel,
        durationSec: r.durationSec,
        queuedAt: r.queuedAt,
      })),
    listTop: (userId, term, limit, offset) => history.listTop(userId, term, limit, offset),
    countRecent: (userId, term) => history.countRecent(userId, term),
  });

  const server = Bun.serve<WsData>({
    hostname: config.host,
    port: config.port,
    development: process.env.NODE_ENV !== "production",
    routes: {
      ...authRoutes,
      ...searchRoutes,
      ...queueRoutes,
      ...historyRoutes,
      "/stream": { GET: streamRoute },
      "/api/health": () => Response.json({ ok: true }),
    },
    websocket: wsMessageHandlers(room),
    async fetch(req, server) {
      const url = new URL(req.url);
      const isUpgrade = req.headers.get("upgrade")?.toLowerCase() === "websocket";
      if (url.pathname === "/ws" && isUpgrade) {
        const origin = req.headers.get("origin");
        if (origin && origin !== config.publicOrigin) {
          return new Response("Forbidden", { status: 403 });
        }
        if (req.headers.get("sec-websocket-protocol") === "lr") {
          /* accepted suffix, matches client */
        }
        const user = session.getUser(req);
        if (!user) return new Response("Unauthorized", { status: 401 });
        const ok = server.upgrade(req, {
          data: { userId: user.id, displayName: user.displayName } as WsData,
        });
        if (!ok) return new Response("Upgrade failed", { status: 400 });
        return undefined as unknown as Response;
      }

      // If static production build exists in dist/, serve static assets and fallback to dist/index.html
      const distDir = join(process.cwd(), "dist");
      const distIndex = Bun.file(join(distDir, "index.html"));
      if (await distIndex.exists()) {
        const pathname = url.pathname.slice(1);
        if (pathname) {
          const candidate = Bun.file(join(distDir, pathname));
          if (await candidate.exists()) {
            return new Response(candidate);
          }
        }
        return new Response(distIndex);
      }

      return index as unknown as Response;
    },
    error(error) {
      log.error(`server error: ${String(error)}`);
      return new Response("Unexpected server error.", { status: 500 });
    },
  });

  const stopPurge = session.purgeLoop();
  log.info(
    `listening-room: http://${config.host}:${config.port} (bun ${Bun.version}, yt-dlp ${ytdlpBinary})`,
  );

  const shutdown = () => {
    log.info("shutting down...");
    stopPurge();
    try {
      server.stop(true);
    } finally {
      db.close();
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("unhandledRejection", (reason) => {
    log.error(`unhandled rejection: ${String(reason)}`);
  });

  return { server, config, db, session, history };
}

if (import.meta.main) {
  bootServer();
}
