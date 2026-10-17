import type { SearchResult } from "@shared/protocol";
import type { YtdlpClient } from "@server/youtube/ytdlp";
import { parseSearchEntryLine } from "@server/youtube/parsers";

export interface SearchFetchDeps {
  ytdlp: YtdlpClient;
  getCachedResults(queryKey: string): SearchResult[] | undefined;
  putCachedResults(queryKey: string, results: SearchResult[]): void;
  getCachedVideo(
    videoId: string,
  ): { title: string; channel: string | null; durationSec: number | null; isLive: boolean } | undefined;
}

function cacheKeyFor(query: string, limit: number): string {
  return `${limit}::${query.replace(/\s+/g, " ").trim().toLowerCase()}`;
}

export async function searchYouTube(
  deps: SearchFetchDeps,
  query: string,
  limit = 10,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const key = cacheKeyFor(query, limit);
  const cached = deps.getCachedResults(key);
  if (cached) return cached;

  const entries = await deps.ytdlp.searchRaw(query, limit, signal);
  const results: SearchResult[] = [];
  for (const entry of entries) {
    const parsed = parseSearchEntryLine(entry);
    if (!parsed) continue;
    if (!/^[A-Za-z0-9_-]{11}$/.test(parsed.videoId)) continue;
    if (parsed.isLive) continue;
    results.push({
      videoId: parsed.videoId,
      title: parsed.title,
      channel: parsed.channel ?? null,
      durationSec: parsed.durationSec,
    });
  }
  deps.putCachedResults(key, results);
  return results;
}

export async function getVideoInfoAny(
  deps: SearchFetchDeps,
  videoId: string,
  signal?: AbortSignal,
): Promise<VideoInfoShape> {
  const cached = deps.getCachedVideo(videoId);
  if (cached) return { videoId, ...cached };
  const info = await deps.ytdlp.getVideoInfo(videoId, signal);
  return {
    videoId,
    title: info.title,
    channel: info.channel,
    durationSec: info.durationSec,
    isLive: info.isLive,
  };
}

type VideoInfoShape = {
  videoId: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
  isLive: boolean;
};
