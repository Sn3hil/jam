import { Mp3Framer } from "./mp3Framer";
import { generateSilenceBytes } from "./ffmpeg";
import type { Mp3Frame } from "./mp3Framer";

export function makeSyntheticSilenceFrames(count: number): Mp3Frame[] {
  const frames: Mp3Frame[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = new Uint8Array(417);
    bytes[0] = 0xff;
    bytes[1] = 0xfb;
    bytes[2] = 0x90;
    bytes[3] = 0x00;
    frames.push({ bytes, hasPadding: false });
  }
  return frames;
}

export async function loadSilenceFrames(ffmpegPath: string): Promise<Mp3Frame[]> {
  const bytes = await generateSilenceBytes(ffmpegPath, 2);
  if (!bytes) return makeSyntheticSilenceFrames(90);
  const framer = new Mp3Framer();
  const pushed = framer.push(bytes);
  const remaining = framer.flush();
  const all = [...pushed, ...remaining];
  return all.length > 0 ? all : makeSyntheticSilenceFrames(90);
}
