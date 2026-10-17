import type { Config } from "@server/config";
import { CHROME_UA } from "@server/youtube/ytdlp";
import { spawnTool } from "@server/lib/spawn";
import { resolveBinary } from "@server/lib/binaries";

export const ENCODE_ARGS = [
  "-hide_banner",
  "-loglevel",
  "error",
  "-nostdin",
  "-vn",
  "-map_metadata",
  "-1",
  "-c:a",
  "libmp3lame",
  "-b:a",
  "128k",
  "-ar",
  "44100",
  "-ac",
  "2",
  "-write_xing",
  "0",
  "-write_id3v2",
  "0",
  "-f",
  "mp3",
];

export async function resolveFfmpegPath(config: Config): Promise<string> {
  const path = await resolveBinary(config.ffmpegPath, "ffmpeg", ["./ffmpeg"]);
  return path;
}

export function ffmpegEncodeCommand(ffmpegPath: string, inputArgs: string[]): string[] {
  return [ffmpegPath, ...inputArgs, ...ENCODE_ARGS, "pipe:1"];
}

export function ffmpegCdnInputArgs(cdnUrl: string): string[] {
  return [
    "-reconnect",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect_delay_max",
    "5",
    "-user_agent",
    CHROME_UA,
    "-i",
    cdnUrl,
  ];
}

export function ffmpegSilenceInputArgs(seconds = 2): string[] {
  return ["-f", "lavfi", "-i", `anullsrc=r=44100:cl=stereo`, "-t", String(seconds)];
}

export async function generateSilenceBytes(ffmpegPath: string, seconds = 2): Promise<Uint8Array | null> {
  if (!ffmpegPath) return null;
  try {
    const result = await spawnTool({
      cmd: ffmpegEncodeCommand(ffmpegPath, ffmpegSilenceInputArgs(seconds)),
      timeoutMs: 15_000,
    });
    if (result.code !== 0 || result.stdoutBytes.length < 1024) return null;
    return result.stdoutBytes;
  } catch {
    return null;
  }
}
