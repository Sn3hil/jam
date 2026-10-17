import { z } from "zod";
import { splitToolExtraArgs } from "@shared/envArgs";

const envSchema = z.object({
  INVITE_CODE: z.string().min(8).max(256),
  PUBLIC_ORIGIN: z.url(),
  API_TOKEN: z.string().default(""),

  HOST: z.ipv4().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DB_PATH: z.string().min(1).default("./data/app.db"),
  MAX_QUEUE_PER_USER: z.coerce.number().int().min(1).max(20).default(5),
  MAX_TRACK_SECONDS: z.coerce.number().int().min(30).max(36000).default(1200),
  ENQUEUE_COOLDOWN_MS: z.coerce.number().int().min(0).max(60000).default(2000),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  LISTENER_GRACE_MS: z.coerce.number().int().min(1000).max(120000).default(12000),
  STREAM_LEAD_SECONDS: z.coerce.number().int().min(1).max(30).default(3),
  PREFETCH_SECONDS: z.coerce.number().int().min(5).max(60).default(20),
  YTDLP_PATH: z.string().default(""),
  FFMPEG_PATH: z.string().default(""),
  YTDLP_COOKIES_PATH: z.string().default(""),
  YTDLP_JS_RUNTIME: z.string().default(""),
  YTDLP_EXTRA_ARGS: z.string().default("--extractor-args youtube:player_client=android"),
});

export interface Config {
  inviteCode: string;
  publicOrigin: string;
  apiToken: string;
  cookieSecure: boolean;
  host: string;
  port: number;
  dbPath: string;
  maxQueuePerUser: number;
  maxTrackSeconds: number;
  enqueueCooldownMs: number;
  sessionTtlDays: number;
  sessionTtlSeconds: number;
  listenerGraceMs: number;
  streamLeadSeconds: number;
  prefetchSeconds: number;
  ytdlpPath: string;
  ffmpegPath: string;
  ytdlpCookiesPath: string;
  ytdlpJsRuntime: string;
  ytdlpExtraArgs: string[];
}

function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`).join("\n");
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    console.error(`Invalid environment (.env):\n${formatZodError(parsed.error)}`);
    process.exit(1);
  }
  const e = parsed.data;
  return {
    inviteCode: e.INVITE_CODE,
    publicOrigin: new URL(e.PUBLIC_ORIGIN).origin,
    apiToken: e.API_TOKEN,
    cookieSecure: e.PUBLIC_ORIGIN.startsWith("https://"),
    host: e.HOST,
    port: e.PORT,
    dbPath: e.DB_PATH,
    maxQueuePerUser: e.MAX_QUEUE_PER_USER,
    maxTrackSeconds: e.MAX_TRACK_SECONDS,
    enqueueCooldownMs: e.ENQUEUE_COOLDOWN_MS,
    sessionTtlDays: e.SESSION_TTL_DAYS,
    sessionTtlSeconds: e.SESSION_TTL_DAYS * 86400,
    listenerGraceMs: e.LISTENER_GRACE_MS,
    streamLeadSeconds: e.STREAM_LEAD_SECONDS,
    prefetchSeconds: e.PREFETCH_SECONDS,
    ytdlpPath: e.YTDLP_PATH,
    ffmpegPath: e.FFMPEG_PATH,
    ytdlpCookiesPath: e.YTDLP_COOKIES_PATH,
    ytdlpJsRuntime: e.YTDLP_JS_RUNTIME,
    ytdlpExtraArgs: splitToolExtraArgs(e.YTDLP_EXTRA_ARGS),
  };
}
