import { loadConfig } from "@server/config";
import { resolveBinary } from "@server/lib/binaries";
import { log } from "@server/lib/log";

async function run(
  cmd: string[],
  timeoutMs = 15000,
): Promise<{ code: number | null; out: string; err: string }> {
  try {
    const proc = Bun.spawn({
      cmd,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });
    const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
    const [out, err] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    await proc.exited;
    clearTimeout(timer);
    return { code: proc.exitCode, out, err };
  } catch {
    return { code: null, out: "", err: "spawn failed" };
  }
}

export interface DoctorReport {
  bun: string;
  ytdlpPath: string;
  ytdlpVersion: string;
  jsRuntime: string;
  jsRuntimeNote: string;
  ffmpegPath: string;
  ffmpegVersion: string;
  cookiesPath: string;
  cookiesStatus: string;
  dbStatus: string;
}

export async function collectReport(env: Record<string, string | undefined>): Promise<DoctorReport> {
  const config = loadConfig(env);
  const ytdlpPath = await resolveBinary(config.ytdlpPath, "yt-dlp");
  const ffmpegPath = await resolveBinary(config.ffmpegPath, "ffmpeg");

  const report: DoctorReport = {
    bun: Bun.version ?? "?",
    ytdlpPath,
    ytdlpVersion: "not found",
    jsRuntime: "",
    jsRuntimeNote: "",
    ffmpegPath,
    ffmpegVersion: "not found",
    cookiesPath: config.ytdlpCookiesPath,
    cookiesStatus: "not configured",
    dbStatus: "",
  };

  if (ytdlpPath) {
    const v = await run([ytdlpPath, "--version"]);
    if (v.code === 0) {
      report.ytdlpVersion = v.out.trim().split(/\s+/)[0] ?? "?";
    }
  }

  if (config.ytdlpJsRuntime) {
    report.jsRuntime = config.ytdlpJsRuntime;
    report.jsRuntimeNote = "explicit via YTDLP_JS_RUNTIME";
  } else if (Bun.which("deno")) {
    report.jsRuntime = Bun.which("deno") ?? "";
    report.jsRuntimeNote = "deno found on PATH";
  } else if (Bun.which("node")) {
    report.jsRuntime = Bun.which("node") ?? "";
    report.jsRuntimeNote = "node found on PATH (deno absent)";
  } else {
    report.jsRuntimeNote =
      "no deno/node on PATH — yt-dlp must fall back to its bundled engine; verify real extraction below";
  }

  if (ffmpegPath) {
    const v = await run([ffmpegPath, "-version"]);
    if (v.code === 0)
      report.ffmpegVersion = (v.out.trim().split("\n")[0] ?? "").match(/(?:n|v)?([0-9.][0-9.]*)/)?.[1] ?? "?";
  }

  if (config.ytdlpCookiesPath) {
    const f = Bun.file(config.ytdlpCookiesPath);
    report.cookiesStatus = (await f.exists()) ? "found" : "MISSING";
  }

  try {
    const dir = config.dbPath.replace(/\/[^/]+$/, "") || ".";
    await Bun.$`mkdir -p ${dir}`.quiet();
    const probe = `${dir}/.doctor-write-probe-${Date.now()}`;
    await Bun.write(probe, "ok");
    await Bun.$`rm -f ${probe}`.quiet();
    report.dbStatus = `writable (${dir})`;
  } catch {
    report.dbStatus = "NOT writable";
  }

  return report;
}

export async function checkExtraction(
  ytdlpPath: string,
  extraArgs: string[],
): Promise<{ ok: boolean; note: string }> {
  const { code, err } = await run(
    [
      ytdlpPath,
      ...extraArgs,
      "--no-playlist",
      "--no-warnings",
      "--flat-playlist",
      "--dump-json",
      "--no-download",
      "--playlist-items",
      "1",
      "ytsearch1:never gonna give you up",
    ],
    30000,
  );
  if (code === 0) return { ok: true, note: "real extraction works" };
  return { ok: false, note: err.trim().split("\n").slice(-3).join(" | ") || "extraction failed" };
}

if (import.meta.main) {
  const config = loadConfig(process.env as unknown as Record<string, string>);
  const report = await collectReport(process.env as unknown as Record<string, string>);
  log.info(`bun          ${report.bun}`);
  log.info(`yt-dlp       ${report.ytdlpPath || "(missing)"} -> ${report.ytdlpVersion}`);
  log.info(`js runtime   ${report.jsRuntime || "(none)"} : ${report.jsRuntimeNote}`);
  log.info(`ffmpeg       ${report.ffmpegPath || "(missing)"} -> ${report.ffmpegVersion}`);
  log.info(`cookies      ${report.cookiesPath || "(none)"} : ${report.cookiesStatus}`);
  log.info(`db           ${report.dbStatus}`);

  const problems: string[] = [];
  if (!report.ytdlpPath || report.ytdlpVersion === "not found") problems.push("yt-dlp is required");
  if (!report.ffmpegPath || report.ffmpegVersion === "not found")
    problems.push("ffmpeg is required (libmp3lame build)");
  if (report.dbStatus.includes("NOT")) problems.push("database path is not writable");
  if (report.cookiesStatus === "MISSING") problems.push("YTDLP_COOKIES_PATH does not exist");

  if (report.ytdlpPath && report.ytdlpVersion !== "not found") {
    log.info("running a real yt-dlp extraction probe...");
    const probe = await checkExtraction(report.ytdlpPath, config.ytdlpExtraArgs);
    log.info(`extraction   ${probe.ok ? "OK" : "FAILED"} : ${probe.note}`);
    if (!probe.ok)
      problems.push("yt-dlp cannot extract from YouTube right now (are cookies / extra args needed?)");
  }

  if (problems.length > 0) {
    for (const problem of problems) log.error(`FAIL: ${problem}`);
    process.exit(1);
  }
  log.info(
    `doctor: all checks passed (bun ${report.bun}, yt-dlp ${report.ytdlpVersion}, ffmpeg ${report.ffmpegVersion})`,
  );
}
