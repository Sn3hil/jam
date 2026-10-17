import type { VideoInfo } from "@shared/protocol";

export interface VideoFullInfo extends VideoInfo {
  streamUrl: string | null;
}

/** Parses the first `--dump-json` line of a yt-dlp info call. Pure. */
export function parseVideoInfoLine(json: unknown): VideoFullInfo | null {
  if (typeof json !== "object" || json === null) return null;
  const o = json as Record<string, unknown>;
  const videoId = typeof o.id === "string" ? o.id : null;
  const title = typeof o.title === "string" ? o.title : null;
  if (!videoId || !title) return null;
  const channel =
    typeof o.channel === "string" && o.channel.length > 0
      ? o.channel
      : typeof o.uploader === "string"
        ? o.uploader
        : null;
  const duration = typeof o.duration === "number" ? o.duration : null;
  const liveStatus: unknown = o.live_status;
  const isLive =
    o.is_live === true ||
    liveStatus === "is_live" ||
    liveStatus === "is_upcoming" ||
    liveStatus === "post_live" ||
    (typeof o.url === "string" && /manifest/i.test(o.url));
  return { videoId, title, channel, durationSec: duration, isLive, streamUrl: null };
}

/** Parses one `--flat-playlist --dump-json` search result line. Pure. */
export function parseSearchEntryLine(json: unknown): {
  videoId: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
  isLive: boolean;
} | null {
  if (typeof json !== "object" || json === null) return null;
  const o = json as Record<string, unknown>;
  const videoId = typeof o.id === "string" ? o.id : null;
  const title = typeof o.title === "string" ? o.title : null;
  if (!videoId || !title) return null;
  const channel = typeof o.channel === "string" && o.channel.length > 0 ? o.channel : null;
  const duration = typeof o.duration === "number" ? o.duration : null;
  const liveStatus: unknown = o.live_status;
  const isLive = o.is_live === true || liveStatus === "is_live" || liveStatus === "is_upcoming";
  return { videoId, title, channel, durationSec: duration, isLive };
}

/** Returns (jsonLines, urlLine) for combined `--dump-json -g` output. Pure. */
export function splitDumpAndUrl(stdout: string): { infoJson: string | null; streamUrl: string | null } {
  const lines = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const streamUrl = lines.length > 0 ? (lines[lines.length - 1] ?? null) : null;
  const infoJsonLine = lines.find((l) => l.startsWith("{"));
  let infoJson: string | null = null;
  if (infoJsonLine) {
    try {
      JSON.parse(infoJsonLine);
      infoJson = infoJsonLine;
    } catch {
      infoJson = null;
    }
  }
  if (streamUrl && (streamUrl.startsWith("{") || streamUrl.startsWith("ytsearch"))) {
    return { infoJson, streamUrl: null };
  }
  return { infoJson, streamUrl };
}
