import { createYtdlpClient } from "@server/youtube/ytdlp";
import { seedFromThumbnail } from "@server/color/seed";
import { hexFromArgb } from "@material/material-color-utilities";
import { loadConfig } from "@server/config";
import { resolveBinary } from "@server/lib/binaries";
import { log } from "@server/lib/log";
import { searchYouTube } from "@server/youtube/search";
import { createMetaCache } from "@server/youtube/metaCache";
import type { SearchResult } from "@shared/protocol";

if (import.meta.main) {
  const config = loadConfig(process.env as unknown as Record<string, string>);
  const binary = await resolveBinary(config.ytdlpPath, "yt-dlp", ["./yt-dlp"]);
  if (!binary) {
    log.error("yt-dlp not found");
    process.exit(1);
  }
  const ytdlp = createYtdlpClient({
    ytdlpPath: binary,
    cookiesPath: config.ytdlpCookiesPath,
    jsRuntime: config.ytdlpJsRuntime,
    extraArgs: config.ytdlpExtraArgs.join(" "),
  });
  const cache = createMetaCache();
  const fetchDeps = {
    ytdlp,
    getCachedResults: (q: string) => cache.getSearch(q),
    putCachedResults: (q: string, r: SearchResult[]) => cache.setSearch(q, r),
    getCachedVideo: (id: string) => cache.getVideo(id),
  };

  log.info("search: 'never gonna give you up'");
  const results = await searchYouTube(fetchDeps, "never gonna give you up", 5);
  for (const r of results) {
    log.info(`  ${r.videoId}  ${r.durationSec ?? "?"}s  ${r.title}  (${r.channel ?? "unknown"})`);
  }

  const target = results[0]?.videoId ?? "dQw4w9WgXcQ";
  log.info(`info: ${target}`);
  const info = await ytdlp.getVideoInfo(target);
  log.info(
    `  title=${info.title} dur=${info.durationSec} live=${info.isLive} url=${(info.streamUrl ?? "").slice(0, 60)}...`,
  );

  const resolved = await ytdlp.resolveStreamUrl(target);
  log.info(`stream url resolves (${resolved.slice(0, 48)}...)`);

  const seed = await seedFromThumbnail(target);
  log.info(`seed: ${seed === null ? "null" : hexFromArgb(seed)} (0x${(seed ?? 0).toString(16)})`);
}
