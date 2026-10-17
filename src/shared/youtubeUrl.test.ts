import { describe, expect, test } from "bun:test";
import { isVideoId, parseYouTubeInput, watchUrl, thumbnailUrl } from "./youtubeUrl";

describe("isVideoId", () => {
  test("11-char ids pass, others fail", () => {
    expect(isVideoId("dQw4w9WgXcQ")).toBe(true);
    expect(isVideoId("a_b-C012345")).toBe(true);
    expect(isVideoId("too_short!")).toBe(false);
    expect(isVideoId("-3V0Z6w77v0")).toBe(true);
    expect(isVideoId("")).toBe(false);
    expect(isVideoId("dQw4w9WgXcQ_")).toBe(false);
  });
});

describe("parseYouTubeInput", () => {
  test("bare 11-char id", () => {
    expect(parseYouTubeInput("dQw4w9WgXcQ")).toEqual({ kind: "video", videoId: "dQw4w9WgXcQ" });
  });

  test("watch URLs across accepted hosts", () => {
    for (const host of ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]) {
      const parsed = parseYouTubeInput(`https://${host}/watch?v=dQw4w9WgXcQ`);
      expect(parsed).toEqual({ kind: "video", videoId: "dQw4w9WgXcQ" });
    }
  });

  test("watch with list strips list", () => {
    const parsed = parseYouTubeInput("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890abcd");
    expect(parsed).toEqual({ kind: "video", videoId: "dQw4w9WgXcQ" });
  });

  test("short url, shorts, live, embed", () => {
    expect(parseYouTubeInput("https://youtu.be/dQw4w9WgXcQ")).toEqual({
      kind: "video",
      videoId: "dQw4w9WgXcQ",
    });
    expect(parseYouTubeInput("youtu.be/dQw4w9WgXcQ?si=x")).toEqual({ kind: "video", videoId: "dQw4w9WgXcQ" });
    expect(parseYouTubeInput("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toEqual({
      kind: "video",
      videoId: "dQw4w9WgXcQ",
    });
    expect(parseYouTubeInput("https://www.youtube.com/live/dQw4w9WgXcQ")).toEqual({
      kind: "video",
      videoId: "dQw4w9WgXcQ",
    });
    expect(parseYouTubeInput("https://www.youtube.com/embed/dQw4w9WgXcQ")).toEqual({
      kind: "video",
      videoId: "dQw4w9WgXcQ",
    });
  });

  test("schemeless youtube paths accepted", () => {
    expect(parseYouTubeInput("www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      kind: "video",
      videoId: "dQw4w9WgXcQ",
    });
  });

  test("playlist-only link", () => {
    expect(parseYouTubeInput("https://www.youtube.com/playlist?list=PL1234567890abcd")).toEqual({
      kind: "playlist",
    });
  });

  test("invalid ids rejected", () => {
    expect(parseYouTubeInput("https://youtu.be/short_id")).toEqual({
      kind: "invalid",
      reason: expect.any(String),
    });
    expect(parseYouTubeInput("https://www.youtube.com/watch?v=bad*id")).toEqual({
      kind: "invalid",
      reason: expect.any(String),
    });
  });

  test("non-youtube hosts and plain text become queries", () => {
    expect(parseYouTubeInput("https://example.com/watch?v=dQw4w9WgXcQ")).toEqual({
      kind: "text",
      query: "https://example.com/watch?v=dQw4w9WgXcQ",
    });
    expect(parseYouTubeInput("never gonna give you up")).toEqual({
      kind: "text",
      query: "never gonna give you up",
    });
  });

  test("query normalization: control chars, whitespace, cap", () => {
    expect(parseYouTubeInput("  spaced \t out   ")).toEqual({ kind: "text", query: "spaced out" });
    const long = "x".repeat(250);
    const parsed = parseYouTubeInput(`   ${long}   `);
    expect(parsed.kind === "text" && parsed.query.length).toBe(100);
  });

  test("youtube root url is invalid, not a query", () => {
    expect(parseYouTubeInput("https://www.youtube.com/feed/subscriptions")).toEqual({
      kind: "invalid",
      reason: expect.any(String),
    });
  });
});

describe("derived urls", () => {
  test("watch and thumbnail", () => {
    expect(watchUrl("dQw4w9WgXcQ")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(thumbnailUrl("dQw4w9WgXcQ")).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg");
  });
});
