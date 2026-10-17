export interface RateLimiter {
  /** Records one event for the key and returns true when still under the limit. */
  hit(key: string, max: number, windowMs: number): boolean;
}

export interface DetailedRateLimiter extends RateLimiter {
  /** Approximate number of hits inside <windowMs> for pruning tests. */
  count(key: string, windowMs: number): number;
}

export function createRateLimiter(): DetailedRateLimiter {
  const windows = new Map<string, number[]>();
  let lastPrune = Date.now();

  function prune(now: number): void {
    if (now - lastPrune < 30_000) return;
    lastPrune = now;
    for (const [key, hits] of windows) {
      const newest = hits[hits.length - 1] ?? 0;
      if (hits.length === 0 || now - newest > 3_600_000) windows.delete(key);
    }
  }

  return {
    hit(key, max, windowMs): boolean {
      const now = Date.now();
      prune(now);
      const hits = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
      hits.push(now);
      windows.set(key, hits);
      return hits.length <= max;
    },
    count(key, windowMs): number {
      const now = Date.now();
      return (windows.get(key) ?? []).filter((t) => now - t < windowMs).length;
    },
  };
}
