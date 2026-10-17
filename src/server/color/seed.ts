import { argbFromRgb, QuantizerCelebi, Score } from "@material/material-color-utilities";
import jpeg from "jpeg-js";
import { thumbnailUrl } from "@shared/youtubeUrl";
import { log } from "@server/lib/log";

export class SeedError extends Error {}

export async function seedFromThumbnail(videoId: string): Promise<number | null> {
  try {
    const res = await fetch(thumbnailUrl(videoId), { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const data = jpeg.decode(buf, { useTArray: true });
    const pixels: number[] = [];
    for (let i = 0; i < data.data.length; i += 4) {
      pixels.push(argbFromRgb(data.data[i] ?? 0, data.data[i + 1] ?? 0, data.data[i + 2] ?? 0));
    }
    if (pixels.length === 0) return null;
    const ranked = Score.score(QuantizerCelebi.quantize(pixels, 128));
    return ranked[0] ?? null;
  } catch (error) {
    log.warn(`seed extraction failed for ${videoId}: ${String(error)}`);
    return null;
  }
}
