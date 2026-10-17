import { describe, expect, test } from "bun:test";
import { Mp3Framer } from "./mp3Framer";

function frameBytes(padding: number, seed: number): Uint8Array {
  const len = 417 + padding;
  const bytes = new Uint8Array(len);
  bytes[0] = 0xff;
  bytes[1] = 0xfb;
  bytes[2] = padding === 1 ? 0x92 : 0x90;
  bytes[3] = 0xc4;
  for (let i = 4; i < len; i++) bytes[i] = (seed + i) & 0xff;
  return bytes;
}

describe("Mp3Framer", () => {
  test("extracts frames split across chunk boundaries", () => {
    const framer = new Mp3Framer();
    const a = frameBytes(0, 1);
    const b = frameBytes(1, 2);
    const stream = new Uint8Array(a.length + b.length);
    stream.set(a, 0);
    stream.set(b, a.length);
    const mid = stream.subarray(0, 100);
    const rest = stream.subarray(100);
    expect(framer.push(mid).length).toBe(0);
    const second = framer.push(rest);
    expect(second.length).toBe(2);
    expect(second[0]!.bytes.subarray(0, 4)).toEqual(a.subarray(0, 4));
    expect(second[1]!.bytes.length).toBe(418);
    expect(second[1]!.hasPadding).toBe(true);
    expect(framer.pendingBytes).toBe(0);
  });

  test("discards bytes that are not frame headers", () => {
    const framer = new Mp3Framer();
    const garbage = new Uint8Array(1000).map((_, i) => (i * 37 + 11) & 0xff);
    expect(framer.push(garbage).length).toBe(0);
    const out = framer.push(frameBytes(0, 3));
    expect(out.length).toBe(1);
  });

  test("rejects wrong bitrate false sync but recovers on real frame", () => {
    const framer = new Mp3Framer();
    const fake = new Uint8Array(300);
    fake[0] = 0xff;
    fake[1] = 0xfb;
    fake[2] = 0x40;
    fake[3] = 0x00;
    const real = frameBytes(0, 7);
    const stream = new Uint8Array([...fake, ...real]);
    const frames = framer.push(stream);
    expect(frames.length).toBe(1);
    expect(frames[0]!.bytes[3]).toBe(real[3]);
  });

  test("discards MPEG-2 / Layer-II false sync", () => {
    const framer = new Mp3Framer();
    const fake = new Uint8Array(300);
    fake[0] = 0xff;
    fake[1] = 0xf5;
    fake[2] = 0x90;
    fake[3] = 0x00;
    const real = frameBytes(0, 9);
    const stream = new Uint8Array([...fake, ...real]);
    const frames = framer.push(stream);
    expect(frames.length).toBe(1);
    expect(frames[0]!.bytes[3]).toBe(real[3]);
  });

  test("skips ID3 tag at stream start", () => {
    const framer = new Mp3Framer();
    const id3 = new Uint8Array(10 + 512);
    id3[0] = 0x49;
    id3[1] = 0x44;
    id3[2] = 0x33;
    id3[8] = 0x04;
    const stream = new Uint8Array([...id3, ...frameBytes(0, 0)]);
    const frames = framer.push(stream);
    expect(frames.length).toBe(1);
    expect(frames[0]!.bytes[0]).toBe(0xff);
  });

  test("flush drops incomplete trailing bytes", () => {
    const framer = new Mp3Framer();
    const whole = frameBytes(0, 1);
    const partial = frameBytes(0, 2).subarray(0, 100);
    const stream = new Uint8Array([...whole, ...partial]);
    expect(framer.push(stream).length).toBe(1);
    expect(framer.flush().length).toBe(0);
    expect(framer.pendingBytes).toBe(partial.length);
  });

  test("later pushes continue after partial trailing bytes", () => {
    const framer = new Mp3Framer();
    const a = frameBytes(0, 1);
    const partial = frameBytes(0, 2).subarray(0, 100);
    const restOfB = new Uint8Array(100);
    restOfB.set(frameBytes(0, 2).subarray(100, 200), 0);
    expect(framer.push(new Uint8Array([...a, ...partial])).length).toBe(1);
    const more = framer.push(restOfB).length;
    expect(more).toBe(0);
    expect(framer.pendingBytes).toBe(200);
  });
});
