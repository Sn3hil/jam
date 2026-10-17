import type { ErrorCode } from "@shared/protocol";

export type YtdlpFailureKind =
  | "AGE_RESTRICTED"
  | "UNAVAILABLE"
  | "REGION_LOCKED"
  | "RATE_LIMITED"
  | "FORMAT"
  | "TIMEOUT"
  | "YTDLP_MISSING"
  | "UNKNOWN";

const PATTERNS: [YtdlpFailureKind, RegExp][] = [
  ["AGE_RESTRICTED", /sign in to confirm (your )?age|age-?restricted|inappropriate content/i],
  ["UNAVAILABLE", /video unavailable|private video|removed by|no longer available|terminated/i],
  [
    "REGION_LOCKED",
    /this content is not available|not available in your country|region-?locked|blocked it in your country/i,
  ],
  ["RATE_LIMITED", /\b429\b|too many requests|confirm you'?re not a bot/i],
  ["FORMAT", /requested format is not available/i],
];

export function classifyStderr(stderr: string, timedOut = false, missingBinary = false): YtdlpFailureKind {
  if (missingBinary) return "YTDLP_MISSING";
  if (timedOut) return "TIMEOUT";
  for (const [kind, re] of PATTERNS) {
    if (re.test(stderr)) return kind;
  }
  if (/js runt/i.test(stderr) || /make sure you have deno/i.test(stderr)) return "YTDLP_MISSING";
  return "UNKNOWN";
}

const KIND_TO_ERROR_CODE: Partial<Record<YtdlpFailureKind, ErrorCode>> = {
  AGE_RESTRICTED: "AGE_RESTRICTED",
  UNAVAILABLE: "UNAVAILABLE",
  REGION_LOCKED: "REGION_LOCKED",
  RATE_LIMITED: "RATE_LIMITED",
  FORMAT: "YOUTUBE_ERROR",
};

export class YoutubeError extends Error {
  readonly kind: YtdlpFailureKind;
  readonly errorCode: ErrorCode;

  constructor(kind: YtdlpFailureKind, stderrTail: string) {
    super(YoutubeError.messageFor(kind, stderrTail));
    this.name = "YoutubeError";
    this.kind = kind;
    this.errorCode = KIND_TO_ERROR_CODE[kind] ?? "YOUTUBE_ERROR";
  }

  private static messageFor(kind: YtdlpFailureKind, stderrTail: string): string {
    const base: Record<YtdlpFailureKind, string> = {
      AGE_RESTRICTED: "This video is age-restricted and cannot be played.",
      UNAVAILABLE: "The video is unavailable (private or removed).",
      REGION_LOCKED: "The video is not available in this region.",
      RATE_LIMITED: "YouTube is throttling requests right now. Try again in a bit.",
      FORMAT: "No suitable audio format for this video.",
      TIMEOUT: "YouTube lookup timed out.",
      YTDLP_MISSING: "yt-dlp or its JS runtime is missing or broken (run `bun run doctor`).",
      UNKNOWN: "The video could not be loaded.",
    };
    const detail = stderrTail.replace(/\s+/g, " ").slice(0, 200);
    return detail.length > 0 ? `${base[kind]} (yt-dlp: ${detail})` : base[kind];
  }
}
