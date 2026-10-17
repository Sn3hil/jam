import type { SearchResult } from "@shared/protocol";
import { LruCache } from "@server/lib/lru";

export interface CachedVideo {
  videoId: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
  isLive: boolean;
}

export interface MetaCache {
  getSearch(queryKey: string): SearchResult[] | undefined;
  setSearch(queryKey: string, results: SearchResult[]): void;
  getVideo(videoId: string): CachedVideo | undefined;
  setVideo(info: CachedVideo): void;
  getStream(videoId: string): string | undefined;
  setStream(videoId: string, url: string): void;
  clearStream(videoId: string): void;
}

export function createMetaCache(): MetaCache {
  const search = new LruCache<string, SearchResult[]>(200, 600_000);
  const video = new LruCache<string, CachedVideo>(2000, 6 * 3600_000);
  const stream = new LruCache<string, string>(2000, 90_000);

  return {
    getSearch: (q) => search.get(q),
    setSearch: (q, results) => {
      search.set(q, results);
      for (const r of results) {
        setVideoInternal(video, r.videoId, r.title, r.channel, r.durationSec);
      }
    },
    getVideo: (id) => video.get(id),
    setVideo: (info) => {
      video.set(info.videoId, { ...info });
    },
    getStream: (id) => stream.get(id),
    setStream: (id, url) => stream.set(id, url),
    clearStream: (id) => stream.delete(id),
  };
}

function setVideoInternal(
  video: LruCache<string, CachedVideo>,
  videoId: string,
  title: string,
  channel: string | null,
  durationSec: number | null,
): void {
  const existing = video.get(videoId);
  if (existing) {
    video.set(videoId, {
      ...existing,
      title,
      channel: channel ?? existing.channel,
      durationSec: durationSec ?? existing.durationSec,
    });
  } else {
    video.set(videoId, { videoId, title, channel, durationSec, isLive: false });
  }
}
