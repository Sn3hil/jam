export type ParsedYouTubeInput =
  | { kind: "video"; videoId: string }
  | { kind: "playlist" }
  | { kind: "invalid"; reason: string }
  | { kind: "text"; query: string };

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const ACCEPTED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);
const SCHEMELESS_RE = /^(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\/\S/i;

export const DEFAULT_THUMB_SIZE = "mqdefault.jpg";

export function isVideoId(s: string): boolean {
  return VIDEO_ID_RE.test(s);
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/${DEFAULT_THUMB_SIZE}`;
}

function stripControlChars(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 0x20 || code === 0x7f ? " " : ch;
  }
  return out;
}

function normalizeQuery(input: string): string {
  const stripped = stripControlChars(input).replaceAll(/\s+/g, " ").trim();
  return stripped.slice(0, 100).trim();
}

function videoFromAny(value: string | null): ParsedYouTubeInput {
  if (value && isVideoId(value)) return { kind: "video", videoId: value };
  return { kind: "invalid", reason: "The link's video ID is not valid." };
}

export function parseYouTubeInput(input: string): ParsedYouTubeInput {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { kind: "text", query: "" };
  if (isVideoId(trimmed)) return { kind: "video", videoId: trimmed };

  let url: URL | null = null;
  try {
    let candidate = trimmed;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate) && SCHEMELESS_RE.test(candidate))
      candidate = `https://${candidate}`;
    url = new URL(candidate);
  } catch {
    url = null;
  }

  if (url && ACCEPTED_HOSTS.has(url.hostname.toLowerCase())) {
    const path = url.pathname;
    const segments = path.split("/").filter(Boolean);

    if (url.hostname === "youtu.be") {
      const id = segments[0];
      if (id === undefined) return { kind: "invalid", reason: "The link doesn't contain a video ID." };
      return videoFromAny(id);
    }

    if (path === "/playlist") {
      return url.searchParams.has("list")
        ? { kind: "playlist" }
        : { kind: "invalid", reason: "Playlist link has no list ID." };
    }

    if (segments[0] === "watch") {
      const v = url.searchParams.get("v");
      if (v === null) return { kind: "invalid", reason: "The watch link has no v parameter." };
      return videoFromAny(v);
    }

    for (const kind of ["shorts", "live", "embed"] as const) {
      if (segments[0] === kind) {
        const id = segments[1];
        if (id === undefined) return { kind: "invalid", reason: `The /${kind} link has no video ID.` };
        return videoFromAny(id);
      }
    }

    return { kind: "invalid", reason: "That is a YouTube URL, but not a video link." };
  }

  return { kind: "text", query: normalizeQuery(trimmed) };
}
