import { describe, expect, test } from "bun:test";
import { classifyStderr, YoutubeError } from "./errors";

describe("classifyStderr", () => {
  test("age restricted", () => {
    expect(
      classifyStderr("ERROR: [youtube] Sign in to confirm your age. This video may be inappropriate"),
    ).toBe("AGE_RESTRICTED");
  });

  test("unavailable", () => {
    expect(classifyStderr("ERROR: This video is unavailable - Private video")).toBe("UNAVAILABLE");
  });

  test("region locked", () => {
    expect(classifyStderr("ERROR: This content is not available in your country")).toBe("REGION_LOCKED");
  });

  test("rate limited", () => {
    expect(classifyStderr("ERROR: unable to download video data: HTTP Error 429: Too Many Requests")).toBe(
      "RATE_LIMITED",
    );
    expect(classifyStderr("ERROR: [youtube] dQw4w9WgXcQ: Confirm you're not a bot")).toBe("RATE_LIMITED");
  });

  test("format", () => {
    expect(classifyStderr("ERROR: Requested format is not available")).toBe("FORMAT");
  });

  test("timeout beats content", () => {
    expect(classifyStderr("video unavailable here", true)).toBe("TIMEOUT");
  });

  test("missing binary", () => {
    expect(classifyStderr("", false, true)).toBe("YTDLP_MISSING");
    expect(classifyStderr("make sure you have deno installed")).toBe("YTDLP_MISSING");
  });

  test("fallback unknown", () => {
    expect(classifyStderr("some other failure")).toBe("UNKNOWN");
  });
});

describe("YoutubeError", () => {
  test("maps kinds to protocol codes", () => {
    expect(new YoutubeError("AGE_RESTRICTED", "").errorCode).toBe("AGE_RESTRICTED");
    expect(new YoutubeError("UNAVAILABLE", "").errorCode).toBe("UNAVAILABLE");
    expect(new YoutubeError("REGION_LOCKED", "").errorCode).toBe("REGION_LOCKED");
    expect(new YoutubeError("RATE_LIMITED", "").errorCode).toBe("RATE_LIMITED");
    expect(new YoutubeError("FORMAT", "").errorCode).toBe("YOUTUBE_ERROR");
    expect(new YoutubeError("TIMEOUT", "").errorCode).toBe("YOUTUBE_ERROR");
    expect(new YoutubeError("YTDLP_MISSING", "").errorCode).toBe("YOUTUBE_ERROR");
    expect(new YoutubeError("UNKNOWN", "tail").message).toContain("tail");
  });
});
