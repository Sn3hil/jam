export interface Mp3Frame {
  readonly bytes: Uint8Array;
  readonly hasPadding: boolean;
}

const FRAME_BASE_LENGTH = 417;
const SAMPLES_PER_FRAME = 1152;
const SAMPLE_RATE = 44100;

export const FRAME_MS = (SAMPLES_PER_FRAME / SAMPLE_RATE) * 1000;

export interface Mp3FramerOptions {
  bitrateIndex?: number;
  sampleRateIndex?: number;
}

export class Mp3Framer {
  private buf: Uint8Array = new Uint8Array(0);
  private offset = 0;
  private id3Skipped = false;

  constructor(private readonly options: Mp3FramerOptions = {}) {}

  push(chunk: Uint8Array): Mp3Frame[] {
    this.append(chunk);
    const result: Mp3Frame[] = [];
    this.skipLeadingId3();
    while (this.extractInto(result)) {
      // keep scanning
    }
    this.compact();
    return result;
  }

  flush(): Mp3Frame[] {
    const result: Mp3Frame[] = [];
    while (this.extractInto(result)) {
      // keep scanning
    }
    this.compact();
    return result;
  }

  get pendingBytes(): number {
    return this.buf.length - this.offset;
  }

  private append(chunk: Uint8Array): void {
    if (chunk.length === 0) return;
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf, 0);
    merged.set(chunk, this.buf.length);
    this.buf = merged;
    this.offset = 0;
  }

  private compact(): void {
    if (this.offset > 0) {
      this.buf = this.buf.slice(this.offset);
      this.offset = 0;
    }
  }

  private skipLeadingId3(): void {
    if (this.id3Skipped || this.buf.length - this.offset < 10) return;
    const b = this.buf;
    const o = this.offset;
    if (b[o] !== 0x49 || b[o + 1] !== 0x44 || b[o + 2] !== 0x33) {
      this.id3Skipped = true;
      return;
    }
    const size = ((b[o + 6] ?? 0) << 21) | ((b[o + 7] ?? 0) << 14) | ((b[o + 8] ?? 0) << 7) | (b[o + 9] ?? 0);
    const skip = 10 + size;
    if (this.buf.length - this.offset < skip) return;
    this.offset += skip;
    this.id3Skipped = true;
  }

  private extractInto(out: Mp3Frame[]): boolean {
    const available = this.buf.length - this.offset;
    if (available < 4) return false;
    const b = this.buf;
    const o = this.offset;
    if (b[o] !== 0xff || (b[o + 1]! & 0xe0) !== 0xe0) {
      this.offset += 1;
      return true;
    }
    const version = (b[o + 1]! >> 3) & 3;
    const layer = (b[o + 1]! >> 1) & 3;
    if (version !== 3 || layer !== 1) {
      this.offset += 1;
      return true;
    }
    const bitrateIndex = (b[o + 2]! >> 4) & 0xf;
    const sampleRateIndex = (b[o + 2]! >> 2) & 3;
    const expectedBitrate = this.options.bitrateIndex ?? 9;
    const expectedSampleRate = this.options.sampleRateIndex ?? 0;
    if (bitrateIndex !== expectedBitrate || sampleRateIndex !== expectedSampleRate) {
      this.offset += 1;
      return true;
    }
    const padding = (b[o + 2]! >> 1) & 1;
    const frameLength = FRAME_BASE_LENGTH + padding;
    if (available < frameLength) return false;
    const bytes = this.buf.slice(o, o + frameLength);
    this.offset += frameLength;
    out.push({ bytes, hasPadding: padding === 1 });
    return true;
  }
}
