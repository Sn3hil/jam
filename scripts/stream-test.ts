import { loadConfig } from "@server/config";
import { resolveBinary } from "@server/lib/binaries";
import { log } from "@server/lib/log";
import { createYtdlpClient } from "@server/youtube/ytdlp";
import { Broadcaster } from "@server/audio/Broadcaster";
import { loadSilenceFrames } from "@server/audio/silence";
import { TrackEncoder } from "@server/audio/TrackEncoder";

const VIDEO_ID = "dQw4w9WgXcQ";
const LISTEN_MS = 6000;

if (import.meta.main) {
  const config = loadConfig(process.env as unknown as Record<string, string>);
  const ffmpegPath = await resolveBinary(config.ffmpegPath, "ffmpeg", ["./ffmpeg"]);
  if (!ffmpegPath) {
    log.error("ffmpeg not found");
    process.exit(1);
  }
  const ytdlpPath = await resolveBinary(config.ytdlpPath, "yt-dlp", ["./yt-dlp"]);
  if (!ytdlpPath) {
    log.error("yt-dlp not found");
    process.exit(1);
  }
  const ytdlp = createYtdlpClient({
    ytdlpPath,
    cookiesPath: config.ytdlpCookiesPath,
    jsRuntime: config.ytdlpJsRuntime,
    extraArgs: config.ytdlpExtraArgs.join(" "),
  });
  const silenceFrames = await loadSilenceFrames(ffmpegPath);
  log.info(`silence bank: ${silenceFrames.length} frames`);

  log.info(`resolving stream url for ${VIDEO_ID}...`);
  const cdnUrl = await ytdlp.resolveStreamUrl(VIDEO_ID);
  log.info("cdn url ok");

  const source = new TrackEncoder({ ffmpegPath, cdnUrl });
  await Promise.race([
    source.ready,
    (async () => {
      await Bun.sleep(25_000);
      if (!source.finished && source.buffered === 0) {
        log.error("encoder never produced frames");
        process.exit(1);
      }
    })(),
  ]);
  log.info(`encoder ready (buffered=${source.buffered})`);

  const broadcaster = new Broadcaster({ silenceFrames, clock: () => performance.now(), intervalMs: 100 });
  broadcaster.start(false);
  broadcaster.setTrack(source);

  type Client = { chunks: Uint8Array[]; done: boolean };
  const clients: Client[] = [];
  for (let i = 0; i < 2; i++) {
    const client: Client = { chunks: [], done: false };
    clients.push(client);
    const readerReady = new Promise<ReadableStreamDefaultReader<Uint8Array>>((resolve) => {
      let controllerRef!: ReadableStreamDefaultController<Uint8Array>;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          broadcaster.addClient({ id: i + 1, userId: i + 1 }, controller);
          controllerRef = controller;
          resolve(controllerRef as unknown as ReadableStreamDefaultReader<Uint8Array>);
        },
        pull() {},
        cancel() {},
      });
      const reader = stream.getReader();
      void (async () => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) client.chunks.push(value);
          if (Date.now() >= deadline) {
            client.done = true;
            reader.cancel().catch(() => {});
            break;
          }
        }
      })();
    });
    void readerReady;
  }
  const deadline = Date.now() + LISTEN_MS;
  log.info(`listening for ${LISTEN_MS}ms...`);

  const waitEnd = async () => {
    while (Date.now() < deadline + 3000 && !clients.every((c) => c.done)) await Bun.sleep(200);
  };
  await waitEnd();
  broadcaster.stop();
  source.kill();

  const counts = clients.map((c) => c.chunks.reduce((n, ch) => n + ch.byteLength, 0));
  log.info(`clients received: ${counts.join(", ")} bytes`);
  if (counts[0]! < 100_000 || counts[1]! < 100_000) {
    log.error("FAILED: expected >100 KB per client");
    process.exit(1);
  }
  const compareLen = Math.min(counts[0]!, counts[1]!);
  const prefix = async (c: Client, n: number) => {
    const buf = new Uint8Array(n);
    let filled = 0;
    for (const chunk of c.chunks) {
      if (filled >= n) break;
      const take = Math.min(n - filled, chunk.byteLength);
      buf.set(chunk.subarray(0, take), filled);
      filled += take;
    }
    return buf;
  };
  const [a, b2] = [await prefix(clients[0]!, compareLen), await prefix(clients[1]!, compareLen)];
  let mismatches = 0;
  for (let i = 0; i < compareLen; i++) {
    if (a[i] !== b2[i]) mismatches += 1;
  }
  log.info(`byte differences across clients: ${mismatches}`);
  if (mismatches > 0) {
    log.error("FAILED: clients are out of sync");
    process.exit(1);
  }
  log.info("smoke OK");
}
