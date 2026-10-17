import { STATUS_CODE_BY_ERROR, type VideoInfo } from "@shared/protocol";
import { searchQuerySchema } from "@shared/schemas";
import { resolveVideoIdFromPath } from "@server/http/pathParams";
import { fail, json, handle, ApiError } from "./errors";
import { assertSameOrigin, queryParam, requireUser, type Ctx } from "./middleware";
import { YoutubeError } from "@server/youtube/errors";

export type SearchResultLite = {
  videoId: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
};

export interface SearchRouteDeps extends Ctx {
  searchYouTube(query: string, limit: number, signal?: AbortSignal): Promise<SearchResultLite[]>;
  getVideoInfo(videoId: string, signal?: AbortSignal): Promise<VideoInfo>;
  limiterSearch(userId: number): boolean;
}

function youtubeHttpException(error: unknown): never {
  if (error instanceof YoutubeError) {
    throw fail(STATUS_CODE_BY_ERROR[error.errorCode], error.errorCode, error.message);
  }
  if (error instanceof ApiError) throw error;
  throw error;
}

export function makeSearchRoutes(deps: SearchRouteDeps) {
  const search = handle(async (req) => {
    assertSameOrigin(deps, req);
    const user = requireUser(deps, req);
    if (!deps.limiterSearch(user.id)) {
      throw fail(429, "RATE_LIMITED", "Slow down a little.");
    }
    const raw = queryParam(req, "q");
    const parsed = searchQuerySchema.safeParse({ q: raw ?? "" });
    if (!parsed.success) throw fail(400, "VALIDATION", "q must be 2-100 characters.");
    try {
      const results = await deps.searchYouTube(parsed.data.q, 10, req.signal ?? undefined);
      return json(200, { results });
    } catch (error) {
      youtubeHttpException(error);
    }
  });

  const video = handle(async (req) => {
    assertSameOrigin(deps, req);
    requireUser(deps, req);
    const id = resolveVideoIdFromPath(req, "/api/video/");
    try {
      const info = await deps.getVideoInfo(id, req.signal ?? undefined);
      return json(200, info);
    } catch (error) {
      youtubeHttpException(error);
    }
  });

  return {
    "/api/search": { GET: search },
    "/api/video/:videoId": { GET: video },
  };
}
