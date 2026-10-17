import { describe, expect, test } from "bun:test";
import { parseSearchEntryLine, parseVideoInfoLine, splitDumpAndUrl } from "./parsers";

const infoJson = JSON.stringify({
  id: "dQw4w9WgXcQ",
  title: "Rick Astley - Never Gonna Give You Up",
  channel: "Rick Astley",
  uploader: "someone-else",
  duration: 212,
  live_status: null,
  is_live: false,
});

describe("parseVideoInfoLine", () => {
  test("maps fields with channel preferring channel over uploader", () => {
    const info = parseVideoInfoLine(JSON.parse(infoJson));
    expect(info?.videoId).toBe("dQw4w9WgXcQ");
    expect(info?.channel).toBe("Rick Astley");
    expect(info?.durationSec).toBe(212);
    expect(info?.isLive).toBe(false);
  });

  test("live detection variants", () => {
    expect(
      parseVideoInfoLine(
        JSON.parse('{"id":"aaaaaaaaaaa","title":"t","is_live":true,"duration":null,"live_status":"is_live"}'),
      )?.isLive,
    ).toBe(true);
    expect(
      parseVideoInfoLine(JSON.parse('{"id":"aaaaaaaaaaa","title":"t","live_status":"is_upcoming"}'))?.isLive,
    ).toBe(true);
    expect(parseVideoInfoLine(JSON.parse('{"id":"aaaaaaaaaaa","title":"t"}'))?.isLive).toBe(false);
  });

  test("rejects missing id or title", () => {
    expect(parseVideoInfoLine(JSON.parse('{"title":"no id"}'))).toBeNull();
    expect(parseVideoInfoLine({})).toBeNull();
    expect(parseVideoInfoLine(null)).toBeNull();
  });
});

describe("parseSearchEntryLine", () => {
  test("maps row", () => {
    const row = parseSearchEntryLine(
      JSON.parse(
        '{"id":"dQw4w9WgXcQ","title":"Song","channel":"Chan","duration":100,"live_status":"not_live"}',
      ),
    );
    expect(row?.isLive).toBe(false);
  });

  test("drops upcoming entries by isLive flag", () => {
    const row = parseSearchEntryLine(
      JSON.parse('{"id":"dQw4w9WgXcQ","title":"Song","live_status":"is_upcoming"}'),
    );
    expect(row?.isLive).toBe(true);
  });

  test("dropped when no title", () => {
    expect(parseSearchEntryLine(JSON.parse('{"id":"dQw4w9WgXcQ"}'))).toBeNull();
  });
});

describe("splitDumpAndUrl", () => {
  test("json line + url line", () => {
    const { infoJson: jsonOut, streamUrl } = splitDumpAndUrl(
      `${infoJson}\nhttps://cdn.example/stream.m3u8\n`,
    );
    expect(jsonOut).toBe(infoJson);
    expect(streamUrl).toBe("https://cdn.example/stream.m3u8");
  });

  test("only url line (plain -g)", () => {
    const { infoJson, streamUrl } = splitDumpAndUrl("https://cdn.example/stream.mp4");
    expect(infoJson).toBeNull();
    expect(streamUrl).toBe("https://cdn.example/stream.mp4");
  });

  test("ignore last line when it is json only", () => {
    const { streamUrl } = splitDumpAndUrl(infoJson);
    expect(streamUrl).toBeNull();
  });
});
