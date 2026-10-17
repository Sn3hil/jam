import { watchUrl } from "@shared/youtubeUrl";
import { parseVideoInfoLine, splitDumpAndUrl, type VideoFullInfo } from "@server/youtube/parsers";
import { spawnTool } from "@server/lib/spawn";
import { createSemaphore, type Semaphore } from "@server/lib/semaphore";
import { classifyStderr, YoutubeError } from "@server/youtube/errors";
import { splitToolExtraArgs } from "@shared/envArgs";

export interface YtdlpOptions {
  ytdlpPath: string;
  cookiesPath: string;
  jsRuntime: string;
  extraArgs: string;
  resolveConcurrency?: number;
}

export interface YtdlpClient {
  binaryPath: string;
  baseArgs(): string[];
  getVideoInfo(videoId: string, signal?: AbortSignal): Promise<VideoFullInfo>;
  resolveStreamUrl(videoId: string, signal?: AbortSignal): Promise<string>;
  searchRaw(query: string, limit: number, signal?: AbortSignal): Promise<unknown[]>;
}

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export function createYtdlpClient(options: YtdlpOptions): YtdlpClient {
  const infoLock: Semaphore = createSemaphore(options.resolveConcurrency ?? 3);
  const extra = splitToolExtraArgs(options.extraArgs);
  const cookieArgs = options.cookiesPath ? ["--cookies", options.cookiesPath] : [];
  const jsArgs = options.jsRuntime ? ["--js-runtimes", options.jsRuntime] : [];

  function baseArgs(): string[] {
    return [...cookieArgs, ...jsArgs, "--no-playlist", "--no-warnings", "--force-ipv4", ...extra];
  }

  function throwFromStderr(
    result: { code: number | null; stderr: string; timedOut: boolean },
    videoId: string,
  ): never {
    const tail = result.stderr.split("\n").filter(Boolean).slice(-3).join(" | ");
    const missing =
      result.stderr.includes("ENOENT") || (result.code === null && /not found|no such file/i.test(tail));
    if (missing && tail.includes(options.ytdlpPath.split("/").pop() ?? "yt-dlp")) {
      throw new YoutubeError("YTDLP_MISSING", "binary not found");
    }
    const kind = classifyStderr(result.stderr, result.timedOut, missing);
    throw new YoutubeError(kind, tail || `lookup failed for ${videoId} (exit ${result.code})`);
  }

  async function callOnce(
    videoId: string,
    urlArgs: string[],
    signal?: AbortSignal,
  ): Promise<{ stdout: string; stderr: string; code: number | null; timedOut: boolean }> {
    const result = await spawnTool({
      cmd: [options.ytdlpPath, ...baseArgs(), ...urlArgs, watchUrl(videoId)],
      timeoutMs: 30_000,
      signal,
    });
    return { stdout: result.stdout, stderr: result.stderr, code: result.code, timedOut: result.timedOut };
  }

  async function withRetry(
    videoId: string,
    urlArgs: string[],
    signal?: AbortSignal,
  ): Promise<{ json: unknown | null; streamUrl: string | null }> {
    return infoLock.run(async () => {
      let previous: { stderr: string; code: number | null; timedOut: boolean } | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await callOnce(videoId, urlArgs, signal);
        previous = result;
        if (result.code === 0) {
          const { infoJson, streamUrl } = splitDumpAndUrl(result.stdout);
          if (infoJson) {
            try {
              return { json: JSON.parse(infoJson) as unknown, streamUrl };
            } catch {
              // malformed json — fall through
            }
          } else if (!urlArgs.includes("--dump-json") && streamUrl) {
            return { json: null, streamUrl };
          }
          continue;
        }
        const kind = classifyStderr(result.stderr, result.timedOut, result.stderr.includes("ENOENT"));
        if (kind === "RATE_LIMITED" || kind === "TIMEOUT") continue;
        throwFromStderr(result, videoId);
      }
      throwFromStderr(
        previous ?? { stderr: "yt-dlp produced no output", code: null, timedOut: false },
        videoId,
      );
    });
  }

  return {
    binaryPath: options.ytdlpPath,
    baseArgs,
    async getVideoInfo(videoId, signal) {
      const { json, streamUrl } = await withRetry(
        videoId,
        ["--dump-json", "-g", "-f", "bestaudio/best"],
        signal,
      );
      const info = parseVideoInfoLine(json);
      if (!info) throw new YoutubeError("UNKNOWN", "unparseable info output");
      return { ...info, streamUrl: streamUrl ?? info.streamUrl };
    },
    async resolveStreamUrl(videoId, signal) {
      const { streamUrl } = await withRetry(videoId, ["-g", "-f", "bestaudio/best"], signal);
      if (!streamUrl) throw new YoutubeError("UNKNOWN", "no stream URL in output");
      return streamUrl;
    },
    async searchRaw(query, limit, signal) {
      return infoLock.run(async () => {
        const result = await spawnTool({
          cmd: [
            options.ytdlpPath,
            ...baseArgs(),
            `ytsearch${limit}:${query}`,
            "--flat-playlist",
            "--dump-json",
            "--no-warnings",
            "--skip-download",
          ],
          timeoutMs: 20_000,
          signal,
        });
        if (result.code !== 0) throwFromStderr({ ...result }, query);
        return result.stdout
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.startsWith("{"))
          .map((l) => {
            try {
              return JSON.parse(l) as unknown;
            } catch {
              return null;
            }
          })
          .filter((v): v is unknown => v !== null);
      });
    },
  };
}

export { CHROME_UA };
