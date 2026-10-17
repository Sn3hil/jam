export function formatDuration(totalSeconds: number | null): string {
  if (totalSeconds === null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return "--:--";
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  if (h > 0) return `${h}:${mm}:${String(sec).padStart(2, "0")}`;
  return `${mm}:${String(sec).padStart(2, "0")}`;
}

export function relativeTime(unixSeconds: number, nowMs: number = Date.now()): string {
  const diffSec = Math.max(0, Math.floor(nowMs / 1000 - unixSeconds));
  const units: [number, string, string][] = [
    [31_536_000, "year", "yr"],
    [2_592_000, "month", "mo"],
    [604_800, "week", "wk"],
    [86_400, "day", "d"],
    [3_600, "hour", "h"],
    [60, "minute", "min"],
  ];
  for (const [limit, long, short] of units) {
    if (diffSec >= limit) {
      const n = Math.floor(diffSec / limit);
      const noun = long;
      const label = `${n} ${n === 1 ? noun : noun === "minute" ? "minutes" : `${noun}s`}`;
      if (short === "min") return `${label} ago`;
      return `${label} ago`;
    }
  }
  return "just now";
}
