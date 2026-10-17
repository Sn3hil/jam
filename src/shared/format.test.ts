import { describe, expect, test } from "bun:test";
import { formatDuration, relativeTime } from "./format";

describe("formatDuration", () => {
  test("formats seconds", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3599)).toBe("59:59");
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(null)).toBe("--:--");
    expect(formatDuration(-5)).toBe("--:--");
  });
});

describe("relativeTime", () => {
  const now = 1_000_000_000_000;
  const s = 1000;
  test("buckets", () => {
    expect(relativeTime((now - 20 * s) / 1000, now)).toBe("just now");
    expect(relativeTime((now - 90 * s) / 1000, now)).toBe("1 minute ago");
    expect(relativeTime((now - 2 * 3599 * s) / 1000, now)).toBe("1 hour ago");
    expect(relativeTime((now - 3 * 86400 * s) / 1000, now)).toBe("3 days ago");
  });
});
